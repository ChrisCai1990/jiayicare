// Rebuild the owned-data inventory under the writer fence before destructive work.
// Checking only the old manifest's rows misses documents/files added since preparation.
const {inventoryDeletion, findSharedFileReferences} = require('./accountDeletionInventory');
const {inventoryLegacyCopies} = require('./accountDeletionLegacy');
const {digest} = require('./accountDeletionExecutor');
function fail(code) { throw Object.assign(new Error(code), {code}); }
const sourceKey = row => row.collection + ':' + row.id;
const fileKey = row => row.storage + ':' + (row.key || row.fingerprint);

async function verifyDeletionManifest({db, models, subject, storage, plan, retry = false, assertFrozen, objectId}) {
  if (!plan || plan.version !== 1 || plan.subject?.userId !== String(subject.userId)
      || plan.subject?.tenantId !== String(subject.tenantId) || !Array.isArray(plan.documents)
      || !Array.isArray(plan.files) || plan.blockers?.length || !Array.isArray(plan.legacy?.documents)
      || plan.legacy.blockers?.length || typeof assertFrozen !== 'function' || typeof objectId !== 'function')
    fail('DELETION_MANIFEST_SCOPE_INVALID');
  async function fence() { if (await assertFrozen(subject) !== true) fail('WRITER_FENCE_NOT_HELD'); }
  await fence();
  const expected = new Map();
  for (const row of plan.documents) {
    if (typeof row.collection !== 'string' || !/^[a-f0-9]{24}$/.test(row.id || '')
        || !/^[a-f0-9]{64}$/.test(row.sha256 || '') || expected.has(sourceKey(row)))
      fail('DELETION_MANIFEST_SOURCE_INVALID');
    expected.set(sourceKey(row), row);
  }
  // The legacy stage must operate on exactly the same historical sources checked here.
  const historical = new Set();
  for (const row of plan.legacy.documents) {
    const known = expected.get(sourceKey(row));
    if (!known || digest(known) !== digest(row) || historical.has(sourceKey(row)))
      fail('DELETION_MANIFEST_LEGACY_MISMATCH');
    historical.add(sourceKey(row));
  }
  for (const row of plan.documents) if (!row.model && !historical.has(sourceKey(row)))
    fail('DELETION_MANIFEST_LEGACY_MISMATCH');

  const current = await inventoryDeletion({models, subject, storage});
  const legacy = await inventoryLegacyCopies({db, models, subject, inventory: plan, storage});
  if (current.blockers.length || legacy.blockers.length) fail('DELETION_MANIFEST_UNCLASSIFIED_DATA');
  for (const row of [...current.documents, ...legacy.documents]) {
    if (!expected.has(sourceKey(row))) fail('DELETION_MANIFEST_NEW_SOURCE');
  }
  const files = new Set(plan.files.map(fileKey));
  if (files.size !== plan.files.length || plan.files.some(row =>
      !['oss', 'local', 'external-reference'].includes(row.storage) || !(row.key || row.fingerprint)))
    fail('DELETION_MANIFEST_FILES_INVALID');
  for (const file of [...current.files, ...legacy.files]) {
    if (!files.has(fileKey(file))) fail('DELETION_MANIFEST_FILE_MISSING');
  }
  const references = await findSharedFileReferences({db, inventory: plan, storage});
  if (references.shared.length) fail('SHARED_FILES_REMAIN');
  for (const row of plan.documents) {
    await fence();
    const document = await db.collection(row.collection).findOne({_id: objectId(row.id)});
    if (!document) {
      // Missing shared patches are never an acceptable retry: another person's data
      // would be missing too. An owned row may already have been removed by this job.
      if (!retry || row.action === 'patch') fail('DELETION_MANIFEST_SOURCE_MISSING');
      continue;
    }
    const hash = digest(document);
    if (hash !== row.sha256 && !(retry && row.action === 'patch' && hash === row.afterSha256))
      fail('DELETION_MANIFEST_SOURCE_CHANGED');
  }
  await fence();
  return {verified: true, scope: 'owned-database-and-shared-file-references',
    checkedSources: plan.documents.length, checkedFiles: plan.files.length,
    limitation: 'Does not verify offline backups, providers, file bytes, or financial retention.'};
}
module.exports = {verifyDeletionManifest};
