const REVISION = 'operator-deletion-20261029-v1';
async function workerReady(db, env = process.env, now = Date.now()) {
  if (!db || env.ACCOUNT_DELETION_GUARD_ENABLED !== 'true') return false;
  const row = await db.collection('accountdeletionworkerstatus').findOne({_id: REVISION});
  const checked = new Date(row?.checkedAt).getTime();
  return !!row && row.ready === true && row.policyVersion === env.ACCOUNT_DELETION_POLICY_VERSION
    && Number.isFinite(checked) && checked <= now && checked > now - 15 * 60 * 1000;
}
module.exports = {REVISION, workerReady};
