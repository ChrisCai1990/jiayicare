const { randomUUID } = require('crypto');
async function beginRenewalSync(period, Model = require('../models/AnnualServicePeriod')) {
  const attemptId = randomUUID();
  const result = await Model.updateOne({ _id: period._id }, { $set: { syncAttemptId: attemptId, syncState: 'running', syncStartedAt: new Date() } });
  if (!result.matchedCount) throw new Error('续约凭据已不存在，请重新核对');
  return attemptId;
}
async function finishRenewalSync(period, attemptId, { issue = null, allowed = true } = {}, Model = require('../models/AnnualServicePeriod')) {
  const filter = { _id: period._id, syncAttemptId: attemptId };
  const success = allowed && !issue;
  const result = await Model.updateOne(filter, { $set: {
    syncState: issue ? (allowed ? 'failed' : 'blocked') : 'idle', syncIssue: issue,
    activationError: issue?.message || '',
    ...(success ? { activationStatus: 'active', lastSyncSuccessAt: new Date() } : {}),
  } });
  if (!result.matchedCount) return result;
  // 以数据库当前值作条件，不依据 gate 读取时的旧快照覆盖首次成功记录。
  await Model.updateOne({ ...filter, activatedAt: null, ...(success ? {} : { activationStatus: { $ne: 'active' } }) },
    { $set: success ? { activatedAt: new Date() } : { activationStatus: issue ? 'failed' : 'waiting' } });
  return result;
}

function renewalIssue(period, now = new Date()) {
  if (period?.correction?.status === 'pending_review') return { role: 'familyDoctor', code: 'correction_review', message: '规划师已提交续约更正，请核对凭据变化及排期影响；原生效记录暂不改变' };
  if (period?.correction?.status === 'rejected') return { role: 'healthPlanner', code: 'correction_rejected', message: `续约更正已退回：${period.correction.reviewNote || '请核对后重新提交，或撤回关闭'}` };
  if (period?.syncState === 'running' && period.syncStartedAt && now - new Date(period.syncStartedAt) > 15 * 60000) return { role: 'healthPlanner', code: 'sync_stalled', message: '年度任务同步超时或中断，请重试；无需重新审核或确认续约' };
  return period?.syncIssue || (period?.activationStatus === 'failed' ? { role: 'healthPlanner', code: 'sync_failed', message: period.activationError || '任务同步未完成，请核对岗位后重试' } : null);
}
function buildAnnualRenewalTodos(plans, periods, staff, now = new Date()) {
  const byPlan = new Map(periods.map(p => [String(p.annualPlanId), p]));
  return plans.flatMap(plan => {
    if (!plan.patientId) return [];
    const period = byPlan.get(String(plan._id));
    const issue = period ? renewalIssue(period, now) : { role: 'healthPlanner', message: `${plan.year}年度：核对已支付年度订单或线下合同及服务期` };
    if (!issue) return [];
    const field = { healthPlanner: 'assignedHealthPlanner', familyDoctor: 'assignedFamilyDoctor' }[issue.role];
    if (staff.role !== 'superadmin' && (staff.role !== issue.role || !field || String(plan.patientId[field] || '') !== String(staff._id))) return [];
    return [{ id: `annual_renewal_${plan._id}`, type: 'annual_renewal_confirmation', label: issue.code === 'correction_review' ? '续约更正·顾问审核' : issue.code === 'correction_rejected' ? '续约更正·已退回' : period ? '年度任务同步异常·待处理' : '下一年度续约凭据待核对', priority: 2,
      patientName: plan.patientId.name || '未知', patientId: String(plan.patientId._id), summary: issue.message, createdAt: plan.createdAt, overdue: false,
      link: `/patients/${plan.patientId._id}/annual-health?year=${plan.year}&planType=${encodeURIComponent(plan.planType)}` }];
  });
}
module.exports = { beginRenewalSync, finishRenewalSync, renewalIssue, buildAnnualRenewalTodos };
