// Server-side composition of the real deletion stages. Never accept adapters or
// storage scopes from an HTTP request. Secondary-copy follow-up is recorded
// separately and must not be represented as immediate provider/backup erasure.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {inventoryDeletion, findSharedFileReferences, canonical} = require('./accountDeletionInventory');
const {inventoryLegacyCopies, eraseLegacyCopies} = require('./accountDeletionLegacy');
const {verifyDeletionManifest} = require('./accountDeletionManifest');
const {executeFinancePlan} = require('./accountDeletionFinance');
const {persistCompletionLedger} = require('./accountDeletionLedger');
const {validateFile, listExactVersions, listExactMultipartUploads, deleteLocalFileVerified,
  deleteOssVersionsVerified, deleteOssFileVerified, abortOssMultipartVerified} = require('./accountDeletionFiles');
function fail(code) { throw Object.assign(new Error(code), {code}); }
const identity = file => file.storage + ':' + (file.key || file.fingerprint);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function storageScope({storage, localRoot, ossClient}) {
  return hash(JSON.stringify(canonical({
    localRoot: localRoot ? await fs.realpath(localRoot) : null,
    // Bind the exact storage target, not credentials (which may rotate).
    oss: ossClient ? {bucket: ossClient.options?.bucket || '', region: ossClient.options?.region || '',
      endpoint: String(ossClient.options?.endpoint?.href || ossClient.options?.endpoint || '')} : null,
    uploadOrigins: [...(storage.uploadOrigins || [])].sort(), ossOrigins: [...(storage.ossOrigins || [])].sort(),
  })));
}

async function localSnapshot(root, file, subject) {
  validateFile({...file, storage: 'oss'}, subject);
  const base = await fs.realpath(root), target = path.resolve(base, file.key);
  if (!target.startsWith(base + path.sep)) fail('DELETION_LOCAL_PATH_INVALID');
  let before;
  try { before = await fs.lstat(target); }
  catch (error) { if (error.code === 'ENOENT') return {absent: true}; throw error; }
  if (!before.isFile() || before.isSymbolicLink() || await fs.realpath(target) !== target)
    fail('DELETION_LOCAL_PATH_INVALID');
  const sha256 = hash(await fs.readFile(target)), after = await fs.lstat(target);
  if (['dev','ino','size','mtimeMs','ctimeMs'].some(key => before[key] !== after[key]))
    fail('DELETION_LOCAL_FILE_CHANGED');
  return {absent: false, sha256};
}
async function bucketVersioning(client) {
  if (!client?.options?.bucket || typeof client.getBucketVersioning !== 'function')
    fail('DELETION_OSS_NOT_CONFIGURED');
  const result = await client.getBucketVersioning(client.options.bucket);
  if (result?.status !== 200 || !Object.hasOwn(result, 'versionStatus')
      || !['', undefined, null, 'Enabled', 'Suspended'].includes(result.versionStatus))
    fail('DELETION_OSS_VERSIONING_UNKNOWN');
  return result.versionStatus || '';
}
async function currentObject(client, key) {
  try {
    const head = await client.head(key);
    const etag = head?.res?.headers?.etag;
    if (head?.res?.status !== 200 || typeof etag !== 'string' || !etag)
      fail('DELETION_OSS_HEAD_UNVERIFIED');
    return {absent: false, etag};
  } catch (error) {
    if (error.code === 'NoSuchKey' && error.status === 404) return {absent: true};
    throw error;
  }
}
function sameMembers(current, planned, key, retry) {
  if (!Array.isArray(planned)) fail('DELETION_STORAGE_PLAN_INVALID');
  const expected = new Map(planned.map(row => [row[key], JSON.stringify(row)]));
  if (expected.size !== planned.length || current.some(row => expected.get(row[key]) !== JSON.stringify(row))
      || (!retry && current.length !== planned.length)) fail('DELETION_STORAGE_CHANGED');
}

// Must run while the actual writer fence is held, before persisting the job.
async function prepareStorageManifest({db, models, subject, storage, localRoot, ossClient, assertFrozen}) {
  async function fence() { if (await assertFrozen(subject) !== true) fail('WRITER_FENCE_NOT_HELD'); }
  await fence();
  const plan = await inventoryDeletion({models, subject, storage});
  plan.storageScope = await storageScope({storage, localRoot, ossClient});
  plan.legacy = await inventoryLegacyCopies({db, models, subject, inventory: plan, storage});
  plan.documents.push(...plan.legacy.documents);
  plan.blockers.push(...plan.legacy.blockers);
  const files = new Map(plan.files.map(file => [identity(file), file]));
  for (const file of plan.legacy.files) {
    if (files.has(identity(file))) files.get(identity(file)).sources.push(...file.sources);
    else files.set(identity(file), file);
  }
  plan.files = [...files.values()];
  if (plan.blockers.length) fail('DELETION_MANIFEST_UNCLASSIFIED_DATA');
  if ((await findSharedFileReferences({db, inventory: plan, storage})).shared.length)
    fail('SHARED_FILES_REMAIN');
  for (const file of plan.files) {
    await fence();
    if (file.storage === 'external-reference') continue;
    Object.assign(file, {ownerId: String(subject.userId), tenantId: String(subject.tenantId),
      exclusive: true, disposition: 'erase'});
    if (file.storage === 'local') Object.assign(file, await localSnapshot(localRoot, file, subject));
    else if (file.storage === 'oss') {
      validateFile(file, subject);
      file.bucket = ossClient?.options?.bucket;
      file.versionStatus = await bucketVersioning(ossClient);
      file.uploads = await listExactMultipartUploads(ossClient, file.key);
      if (file.versionStatus) file.versions = await listExactVersions(ossClient, file.key);
      else file.current = await currentObject(ossClient, file.key);
    } else fail('DELETION_STORAGE_UNCLASSIFIED');
  }
  await fence();
  // The separate finance plan and provider/backup scope are still required.
  return plan;
}

function createDeletionRuntime({db, models, storage, localRoot, ossClient, encryptionKeys, env,
  assertFrozen, objectId, externalCopies}) {
  externalCopies ||= require('./accountDeletionFollowup').createSecondaryCopyFollowup({
    collection: db?.collection('accountdeletionfollowups'), policyVersion: env?.ACCOUNT_DELETION_POLICY_VERSION});
  if (!db || !models || !storage || typeof assertFrozen !== 'function' || typeof objectId !== 'function'
      || !env || env.ACCOUNT_DELETION_GUARD_ENABLED !== 'true'
      || !['preflight','erase','verify'].every(method => typeof externalCopies?.[method] === 'function'))
    fail('DELETION_RUNTIME_NOT_CONFIGURED');
  async function shared(plan, fence) {
    if (await fence() !== true) fail('WRITER_FENCE_NOT_HELD');
    if ((await findSharedFileReferences({db, inventory: plan, storage})).shared.length)
      fail('SHARED_FILES_REMAIN');
    return true;
  }
  async function checkFiles(plan, {subject, fence, retry = false, absent = false}) {
    if (plan.storageScope !== await storageScope({storage, localRoot, ossClient}))
      fail('DELETION_STORAGE_SCOPE_CHANGED');
    for (const file of plan.files) {
      if (await fence() !== true) fail('WRITER_FENCE_NOT_HELD');
      if (file.storage === 'external-reference') continue;
      validateFile({...file, storage: 'oss'}, subject);
      if (file.storage === 'local') {
        const current = await localSnapshot(localRoot, file, subject);
        if (absent ? !current.absent : current.absent ? !(retry || file.absent === true)
          : file.absent === true || current.sha256 !== file.sha256) fail('DELETION_STORAGE_CHANGED');
      } else if (file.storage === 'oss') {
        if (file.bucket !== ossClient?.options?.bucket || file.versionStatus !== await bucketVersioning(ossClient))
          fail('DELETION_STORAGE_SCOPE_CHANGED');
        const uploads = await listExactMultipartUploads(ossClient, file.key);
        sameMembers(uploads, absent ? [] : file.uploads, 'uploadId', retry);
        if (file.versionStatus) {
          const versions = await listExactVersions(ossClient, file.key);
          sameMembers(versions, absent ? [] : file.versions, 'versionId', retry);
        } else {
          const current = await currentObject(ossClient, file.key);
          if (absent ? !current.absent : current.absent ? !(retry || file.current?.absent === true)
            : file.current?.absent !== false || current.etag !== file.current.etag)
            fail('DELETION_STORAGE_CHANGED');
        }
        if (absent && !(await currentObject(ossClient, file.key)).absent) fail('DELETION_STORAGE_REMAINS');
      } else fail('DELETION_STORAGE_UNCLASSIFIED');
    }
  }
  async function verifyExternal(plan, context) {
    await checkFiles(plan, {...context, retry: true, absent: true});
    const legacy = await inventoryLegacyCopies({db, models, subject: context.subject, inventory: plan, storage});
    if (legacy.documents.length || legacy.blockers.length) fail('DELETION_LEGACY_REMAINS');
    const proof = await externalCopies.verify(plan, context);
    if (proof?.verified !== true) fail('EXTERNAL_ERASURE_UNVERIFIED');
    if (await context.fence() !== true) fail('WRITER_FENCE_NOT_HELD');
    return {verified: true, scope: 'account-and-active-data', files: plan.files.length, external: proof};
  }
  return {
    assertFrozen,
    async verifyManifest(plan, context) {
      await verifyDeletionManifest({db, models, subject: context.subject, storage, plan,
        retry: context.retry, assertFrozen: context.fence, objectId});
      // Verify ALL file versions and external prerequisites before financial originals
      // or any other source is removed; a later file failure cannot hide a bad plan.
      await checkFiles(plan, context);
      if ((await externalCopies.preflight(plan, context))?.verified !== true)
        fail('EXTERNAL_ERASURE_NOT_READY');
      return {verified: true};
    },
    archiveFinancialData(plan, context) {
      return executeFinancePlan({models, subject: context.subject, requestId: objectId(plan.requestId),
        plan: plan.finance, encryptionKeys, assertFrozen: context.fence, objectId});
    },
    async eraseFiles(plan, context) {
      for (const file of plan.files) {
        if (file.storage === 'external-reference') continue;
        const args = {file, subject: context.subject, assertFrozen: context.fence,
          assertExclusive: () => shared(plan, context.fence)};
        if (file.storage === 'local') await deleteLocalFileVerified({...args, root: localRoot});
        else if (file.storage === 'oss') {
          await abortOssMultipartVerified({...args, client: ossClient, uploads: file.uploads});
          if (file.versionStatus) await deleteOssVersionsVerified({...args, client: ossClient, versions: file.versions});
          else await deleteOssFileVerified({...args, client: ossClient});
        } else fail('DELETION_STORAGE_UNCLASSIFIED');
      }
      await checkFiles(plan, {...context, retry: true, absent: true});
      return {verified: true, files: plan.files.length};
    },
    async eraseOtherCopies(plan, context) {
      await eraseLegacyCopies({db, subject: context.subject, plan: plan.legacy,
        assertFrozen: context.fence, objectId});
      const proof = await externalCopies.erase(plan, context);
      if (proof?.verified !== true) fail('EXTERNAL_ERASURE_UNVERIFIED');
      return {verified: true, external: proof};
    },
    verifyCompletionScope: verifyExternal,
    recordCompletion(entry, {fence}) {
      return persistCompletionLedger({env, databaseName: db.databaseName, entry, assertFrozen: fence});
    },
  };
}
module.exports = {prepareStorageManifest, createDeletionRuntime};
