// Internal operator command: list pending requests, or execute one authenticated
// request. Never accepts a user ID or an HTTP "mark completed" instruction.
require('dotenv').config();
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const mongoose = require('mongoose');
const {acquireOfflineFence, assertOfflineFence, releaseOfflineFence, validateWriters, readHostState} = require('../src/utils/accountDeletionOfflineFence');
const {REVISION} = require('../src/utils/accountDeletionReadiness');
const {configuration, readLedger} = require('../src/utils/accountDeletionStartupGuard');
const {prepareStorageManifest, createDeletionRuntime} = require('../src/utils/accountDeletionRuntime');
const {prepareFinancePlan} = require('../src/utils/accountDeletionFinance');
const {prepareJob, executeDeletion} = require('../src/utils/accountDeletionExecutor');
const objectId = value => new mongoose.Types.ObjectId(value);
function fail(code) { throw Object.assign(new Error(code), {code}); }
function readJson(filename) {
  if (!path.isAbsolute(filename)) fail('OPERATOR_FILE_MUST_BE_ABSOLUTE');
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024
      || process.platform !== 'win32' && (stat.mode & 0o077)) fail('OPERATOR_FILE_MUST_BE_PRIVATE');
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}
async function main() {
  let [action, requestId, reviewFile] = process.argv.slice(2);
  if (!['list','poll','execute','resume'].includes(action)) fail('USE_LIST_POLL_EXECUTE_OR_RESUME');
  if (!['list','poll'].includes(action) && !/^[a-f0-9]{24}$/.test(requestId || '')) fail('REQUEST_ID_REQUIRED');
  for (const file of fs.readdirSync(path.join(__dirname, '../src/models')).filter(file => file.endsWith('.js')))
    require(path.join(__dirname, '../src/models', file));
  await mongoose.connect(process.env.MONGODB_URI, {autoIndex: false});
  const db = mongoose.connection.db, models = mongoose.models;
  const requests = models.AccountDeletionRequest.collection, jobs = models.AccountDeletionJob.collection;
  if (action === 'list') {
    const rows = await requests.find({status: {$ne: 'completed'}},
      {projection: {_id: 1, status: 1, requestedAt: 1, completionDays: 1}}).sort({requestedAt: 1}).limit(100).toArray();
    console.log(JSON.stringify({requests: rows})); return;
  }
  const config = configuration(), ledger = readLedger();
  if (!config || ledger.databaseName !== db.databaseName) fail('DELETION_GUARD_CONFIGURATION_INVALID');
  const writers = JSON.parse(process.env.ACCOUNT_DELETION_WRITERS || 'null'); validateWriters(writers);
  const options = mongoose.connection.getClient().options;
  const databaseHash = crypto.createHash('sha256').update(JSON.stringify({hosts: options.hosts.map(String).sort(),
    database: db.databaseName, replicaSet: options.replicaSet || ''})).digest('hex');
  if (action === 'poll') {
    const state = readHostState(writers, databaseHash);
    const storage = JSON.parse(process.env.ACCOUNT_DELETION_STORAGE || 'null');
    const keys = JSON.parse(process.env.ACCOUNT_DELETION_ARCHIVE_KEYS || '{}');
    const archiveKey = keys[process.env.ACCOUNT_DELETION_ARCHIVE_KEY_ID];
    const ready = !fs.existsSync(config.lock) && !state.undeclared.length
      && state.states.every(row => row.databaseHash === databaseHash && row.guardEnabled
        && row.lockFile === config.lock && row.ledgerFile === config.ledger)
      && !!require('../src/utils/accountDeletionRequest').readPolicy()
      && !!storage && path.isAbsolute(storage.localRoot || '') && fs.existsSync(storage.localRoot)
      && Array.isArray(storage.uploadOrigins) && Array.isArray(storage.ossOrigins)
      && /^[A-Za-z0-9+/]{43}=$/.test(archiveKey || '');
    await db.collection('accountdeletionworkerstatus').updateOne({_id: REVISION},
      {$set: {ready, checkedAt: new Date(), policyVersion: process.env.ACCOUNT_DELETION_POLICY_VERSION}}, {upsert: true});
    if (!ready) fail('DELETION_WORKER_NOT_READY');
    // This implementation uses an environment-wide maintenance fence. A periodic
    // readiness check must NEVER stop the live API merely because a request arrived.
    // Execution remains an explicit operator action in a planned maintenance window.
    const pending = await requests.countDocuments({status: {$ne:'completed'}});
    console.log(JSON.stringify({ready: true, pending, execution: 'operator-maintenance'}));
    return;
  }
  const request = await requests.findOne({_id: objectId(requestId)});
  if (!request || request.policyVersion !== process.env.ACCOUNT_DELETION_POLICY_VERSION) fail('REQUEST_POLICY_MISMATCH');
  if (request.status === 'completed' && action !== 'resume') {
    if (fs.existsSync(config.lock)) fail('MAINTENANCE_RESUME_REQUIRED');
    console.log(JSON.stringify({requestId, status: 'completed'})); return;
  }
  const subject = {userId: request.user, tenantId: request.tenantId};
  const storageConfig = JSON.parse(process.env.ACCOUNT_DELETION_STORAGE || 'null');
  if (!storageConfig || !Array.isArray(storageConfig.uploadOrigins) || !Array.isArray(storageConfig.ossOrigins)
      || !path.isAbsolute(storageConfig.localRoot || '')) fail('DELETION_STORAGE_NOT_CONFIGURED');
  let ossClient;
  if (storageConfig.ossOrigins.length) {
    const OSS = require('ali-oss');
    for (const key of ['OSS_BUCKET','OSS_REGION','OSS_ACCESS_KEY_ID','OSS_ACCESS_KEY_SECRET'])
      if (!process.env[key]) fail('DELETION_OSS_NOT_CONFIGURED');
    // Dedicated instance: aborting multipart uploads must never affect application uploads.
    ossClient = new OSS({bucket: process.env.OSS_BUCKET, region: process.env.OSS_REGION,
      accessKeyId: process.env.OSS_ACCESS_KEY_ID, accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
      ...(process.env.OSS_ENDPOINT ? {endpoint: process.env.OSS_ENDPOINT} : {}), secure: true});
  }
  const encryptionKeys = JSON.parse(process.env.ACCOUNT_DELETION_ARCHIVE_KEYS || '{}');
  const review = reviewFile ? readJson(reviewFile) : null;
  if (review && (review.requestId !== requestId || !Array.isArray(review.entries))) fail('FINANCE_REVIEW_SCOPE_INVALID');
  await jobs.createIndex({requestId: 1}, {unique: true});
  await db.collection('accountdeletionfollowups').createIndex({requestId: 1, policyVersion: 1, kind: 1}, {unique: true});
  let token;
  if (action === 'resume') {
    const lock = readJson(config.lock);
    if (lock.verifiedDatabaseHash !== databaseHash) fail('DELETION_DATABASE_CHANGED');
    token = lock.recoveryToken; assertOfflineFence({token});
  } else token = acquireOfflineFence({writers, verifiedDatabaseHash: databaseHash}).token;
  const fence = async () => assertOfflineFence({token});
  let destructive = false, releasing = false;
  try {
    let job = await jobs.findOne({requestId: request._id});
    if (!job) {
      const plan = await prepareStorageManifest({db, models, subject, storage: storageConfig,
        localRoot: storageConfig.localRoot, ossClient, assertFrozen: fence});
      plan.finance = await prepareFinancePlan({models, subject, requestId: request._id,
        keyId: process.env.ACCOUNT_DELETION_ARCHIVE_KEY_ID,
        encryptionKey: encryptionKeys[process.env.ACCOUNT_DELETION_ARCHIVE_KEY_ID],
        classificationFor: async (sourceType, source) => {
          const entry = review?.entries.find(row => row.sourceType === sourceType && row.sourceId === String(source._id));
          if (!entry) fail('FINANCE_ORIGINAL_REQUIRES_REVIEW');
          return {...entry, reviewedBy: objectId(entry.reviewedBy)};
        }});
      job = await prepareJob({jobs, request, manifest: plan});
    }
    const runtime = createDeletionRuntime({db, models, storage: storageConfig,
      localRoot: storageConfig.localRoot, ossClient, encryptionKeys, env: process.env,
      assertFrozen: fence, objectId});
    // A crashed worker's live lease is never stolen by this command.
    await executeDeletion({jobs, requests, models, jobId: job._id, runtime});
    releasing = true;
    await releaseOfflineFence({token, db, objectId});
    console.log(JSON.stringify({requestId, status: 'completed', scope: 'account-and-active-data',
      secondaryCleanup: 'tracked-separately'}));
  } catch (error) {
    const current = await jobs.findOne({requestId: request._id});
    destructive = !!current?.destructiveStartedAt && current.state !== 'completed';
    // A failed preflight changed no originals; restore service. Partial execution
    // retains the maintenance lock for an explicit resume, never an automatic bypass.
    if (!destructive && !releasing) {
      const code = /^[A-Z_]{3,80}$/.test(error.code || '') ? error.code : 'PREFLIGHT_REQUIRES_REVIEW';
      await requests.updateOne({_id: request._id, status: {$ne: 'completed'}}, {$set: {status: 'needs_review', operatorFailure: code}});
      await releaseOfflineFence({token, db, objectId});
    }
    if (destructive) console.error(JSON.stringify({requestId, maintenanceHeld: true, resumeRequired: true}));
    throw error;
  }
}
main().catch(error => {
  console.error(JSON.stringify({error: /^[A-Z_]{3,80}$/.test(error.code || '') ? error.code : 'DELETION_WORKER_FAILED'}));
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
