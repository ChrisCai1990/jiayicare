const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { readLedger } = require('./accountDeletionStartupGuard');
function fail(code) { throw Object.assign(new Error(code), { code }); }
// The caller holds the offline writer fence. This ledger must reside outside database
// backups and application release directories; it never contains report/health contents.
async function persistCompletionLedger({ env, databaseName, entry, assertFrozen }) {
  if (!env || env.ACCOUNT_DELETION_GUARD_ENABLED !== 'true' || typeof assertFrozen !== 'function') fail('DELETION_LEDGER_NOT_CONFIGURED');
  if (await assertFrozen() !== true) fail('DELETION_LEDGER_FENCE_LOST');
  const filename = env.ACCOUNT_DELETION_LEDGER_FILE;
  if (!filename || !path.isAbsolute(filename)) fail('DELETION_LEDGER_NOT_CONFIGURED');
  const lockname = filename + '.writer.lock';
  // Exclusive file creation prevents lost append, even if two workers were misconfigured.
  const lock = await fs.open(lockname, 'wx', 0o600);
  let temporary;
  try {
    const ledger = readLedger(env);
    if (ledger.databaseName !== databaseName) fail('DELETION_LEDGER_DATABASE_MISMATCH');
    const normalized = { userId: String(entry.userId), tenantId: String(entry.tenantId), requestId: String(entry.requestId),
      completionEvidence: entry.completionEvidence, completedAt: new Date(entry.completedAt).toISOString() };
    if (!['userId','tenantId','requestId'].every(k=>/^[a-f0-9]{24}$/.test(normalized[k])) || !/^[a-f0-9]{64}$/.test(normalized.completionEvidence || '')) fail('DELETION_LEDGER_ENTRY_INVALID');
    const previous = ledger.entries.find(e => e.userId === normalized.userId);
    if (previous) {
      if (Object.keys(normalized).some(k=>previous[k] !== normalized[k])) fail('DELETION_LEDGER_CONFLICT');
      return { verified: true, alreadyRecorded: true };
    }
    if (await assertFrozen() !== true) fail('DELETION_LEDGER_FENCE_LOST');
    temporary = filename + '.' + crypto.randomBytes(16).toString('hex') + '.tmp';
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify({ ...ledger, entries: [...ledger.entries, normalized] }) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    if (await assertFrozen() !== true) fail('DELETION_LEDGER_FENCE_LOST');
    await fs.rename(temporary, filename); temporary = undefined;
    if (process.platform !== 'win32') {
      const directory = await fs.open(path.dirname(filename), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    }
    const saved = readLedger(env).entries.find(e => e.userId === normalized.userId);
    if (!saved || Object.keys(normalized).some(k=>saved[k] !== normalized[k])) fail('DELETION_LEDGER_WRITE_UNVERIFIED');
    return { verified: true, alreadyRecorded: false };
  } finally {
    if (temporary) await fs.unlink(temporary).catch(()=>{});
    await lock.close(); await fs.unlink(lockname);
  }
}
module.exports = { persistCompletionLedger };
