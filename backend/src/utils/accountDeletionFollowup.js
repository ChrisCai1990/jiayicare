// Secondary-copy work is tracked separately from closing the account. A saved
// task is evidence of follow-up being scheduled, NEVER evidence of erasure.
function fail(code) { throw Object.assign(new Error(code), {code}); }
const KINDS = ['backup', 'security_log', 'provider'];
function createSecondaryCopyFollowup({collection, policyVersion, now = () => new Date()}) {
  if (!collection || !policyVersion) fail('SECONDARY_CLEANUP_NOT_CONFIGURED');
  async function scope(plan, {fence}) {
    if (await fence() !== true) fail('WRITER_FENCE_NOT_HELD');
    if (!/^[a-f0-9]{24}$/.test(plan.requestId || '') || plan.policyVersion !== policyVersion)
      fail('SECONDARY_CLEANUP_SCOPE_INVALID');
    return {requestId: plan.requestId, policyVersion};
  }
  return {
    async preflight(plan, context) { await scope(plan, context); return {verified: true, scope: 'followup-configuration'}; },
    async erase(plan, context) {
      const filter = await scope(plan, context), createdAt = now();
      for (const kind of KINDS) {
        if (await context.fence() !== true) fail('WRITER_FENCE_NOT_HELD');
        await collection.updateOne({...filter, kind}, {$setOnInsert: {...filter, kind,
          status: 'pending', createdAt, dueAt: new Date(createdAt.getTime() + 7 * 86400000),
          instruction: kind === 'backup'
            ? 'Restrict to disaster recovery; purge deleted personal records before any restore is made available.'
            : kind === 'security_log'
              ? 'Review necessary retention and restricted access; remove unnecessary personal content.'
              : 'Check actual prior transfers; request deletion or document applicable retention. No new model calls.'}}, {upsert: true});
      }
      return this.verify(plan, context);
    },
    async verify(plan, context) {
      const filter = await scope(plan, context);
      const rows = await collection.find(filter).toArray();
      if (rows.length !== KINDS.length || KINDS.some(kind => rows.filter(row => row.kind === kind).length !== 1)
          || rows.some(row => !['pending','in_progress','completed','retained'].includes(row.status)))
        fail('SECONDARY_CLEANUP_NOT_RECORDED');
      const pending = KINDS.filter(kind => rows.find(row => row.kind === kind).status !== 'completed');
      return {verified: true, scope: 'secondary-copy-followup-recorded',
        allExternalErased: false, pending, limitation: 'Scheduling does not certify backup, log, or provider deletion.'};
    },
  };
}
module.exports = {createSecondaryCopyFollowup};
