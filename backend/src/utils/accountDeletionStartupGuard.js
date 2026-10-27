// A maintenance lock is outside MongoDB: restoring an old database cannot remove it.
// This guard prevents restart/restore resurrection. It does NOT stop an already running
// writer; the offline coordinator must stop and verify every configured writer first.
const fs = require('node:fs');
const path = require('node:path');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function configuration(env = process.env) {
  if (env.ACCOUNT_DELETION_GUARD_ENABLED !== 'true') return null;
  const lock = env.ACCOUNT_DELETION_MAINTENANCE_FILE, ledger = env.ACCOUNT_DELETION_LEDGER_FILE;
  if (!lock || !ledger || !path.isAbsolute(lock) || !path.isAbsolute(ledger) || path.resolve(lock) === path.resolve(ledger)) fail('DELETION_GUARD_CONFIGURATION_INVALID');
  return { lock, ledger };
}
function assertStartupAllowed(env = process.env, maintenanceToken) {
  const config = configuration(env);
  if (!config) return false;
  // Empty/truncated locks still block startup. Never expire a lock by wall-clock time.
  try { fs.lstatSync(config.lock); } catch (error) {
    if (error.code === 'ENOENT') return true;
    fail('DELETION_MAINTENANCE_CHECK_FAILED');
  }
  if (/^[a-f0-9]{64}$/.test(maintenanceToken || '')) {
    const lock = JSON.parse(fs.readFileSync(config.lock, 'utf8'));
    if (lock.version === 1 && lock.state === 'stopped' && lock.tokenHash === require('node:crypto').createHash('sha256').update(maintenanceToken).digest('hex')) return true;
  }
  fail('DELETION_MAINTENANCE_ACTIVE');
}
function readLedger(env = process.env) {
  const config = configuration(env);
  if (!config) return null;
  let ledger;
  try {
    const stat = fs.lstatSync(config.ledger);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) fail('DELETION_LEDGER_INVALID');
    ledger = JSON.parse(fs.readFileSync(config.ledger, 'utf8'));
  } catch { fail('DELETION_LEDGER_UNREADABLE'); }
  if (ledger.version !== 1 || typeof ledger.databaseName !== 'string' || !ledger.databaseName || !Array.isArray(ledger.entries)) fail('DELETION_LEDGER_INVALID');
  const ids = new Set();
  for (const entry of ledger.entries) {
    if (!entry || !['userId', 'tenantId', 'requestId'].every(key => /^[a-f0-9]{24}$/.test(entry[key] || ''))
      || !/^[a-f0-9]{64}$/.test(entry.completionEvidence || '') || !Number.isFinite(Date.parse(entry.completedAt)) || ids.has(entry.userId)) fail('DELETION_LEDGER_INVALID');
    ids.add(entry.userId);
  }
  return ledger;
}
async function verifyRestoredDatabase({ db, objectId, env = process.env, maintenanceToken }) {
  if (!assertStartupAllowed(env, maintenanceToken)) return { enabled: false };
  const ledger = readLedger(env);
  if (db.databaseName !== ledger.databaseName) fail('DELETION_LEDGER_DATABASE_MISMATCH');
  const interrupted = await db.collection('accountdeletionjobs').findOne({ state: { $in: ['running','failed'] }, destructiveStartedAt: { $type: 'date' } }, { projection: { _id: 1 } });
  if (interrupted) fail('DELETION_EXECUTION_INCOMPLETE');
  for (const entry of ledger.entries) {
    const user = await db.collection('users').findOne({ _id: objectId(entry.userId) }, { projection: { _id: 1 } });
    if (user) fail('DELETED_ACCOUNT_RESTORED');
    const receipt = await db.collection('accountdeletionrequests').findOne({ _id: objectId(entry.requestId), user: objectId(entry.userId), tenantId: objectId(entry.tenantId), status: 'completed', completionEvidence: entry.completionEvidence });
    if (!receipt?.completedAt || new Date(receipt.completedAt).toISOString() !== new Date(entry.completedAt).toISOString()) fail('DELETION_RECEIPT_RESTORED_OR_MISSING');
  }
  // Lock may have appeared during database verification.
  assertStartupAllowed(env, maintenanceToken);
  return { enabled: true, verified: ledger.entries.length };
}
module.exports = { configuration, assertStartupAllowed, readLedger, verifyRestoredDatabase };
