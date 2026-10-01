const { createHash } = require('crypto');
const labels = { medical_treatment: '医疗问题解决', checkup_completion: '体检完善', abnormal_followup: '异常复查', vaccine: '疫苗接种', personalized_followups: '个性化方案' };
const fields = ['items', 'name', 'department', 'standardPlanId', 'standardContent', 'standardSchedule', 'sourceCycles', 'defaultRole', 'personalizedAdvice', 'personalization', 'time', 'visit_time', 'executionDate', 'timeWindow', 'timingStatus'];
function comparable(row) {
  if (!row) return null;
  return Object.fromEntries(fields.map(key => [key, row[key] ?? null]));
}
function changesForExecution(changes = []) {
  return changes.filter(change => labels[change.key] && JSON.stringify(comparable(change.before)) !== JSON.stringify(comparable(change.after)));
}
function markForReview(plan, changes) {
  return (plan.confirmedAt || plan.frozenAt) && changesForExecution(changes).length
    ? { status: 'pending', version: 1 } : null;
}
function reviews(plan) {
  return (plan.supplementRevisions || []).filter(r => r.status === 'applied' && r.executionReview?.version === 1);
}
function pending(plan) { return reviews(plan).filter(r => r.executionReview.status === 'pending'); }
function title(row) { return row?.items || row?.name || row?.department || row?.standardPlanName || '事项'; }
function summary(change) {
  return { module: labels[change.key], title: title(change.after || change.before),
    action: !change.before ? '新增' : !change.after ? (change.operation === 'remove' ? '移除事项' : '移出原分类') : '更新',
    deletionReason: change.deletionReason || '',
    before: change.before ? { title: title(change.before), advice: change.before.personalizedAdvice || change.before.personalization || change.before.reason || '', date: change.before.executionDate || change.before.visit_time || change.before.time || '', timing: change.before.timeWindow || '' } : null,
    after: change.after ? { title: title(change.after), advice: change.after.personalizedAdvice || change.after.personalization || change.after.reason || '', date: change.after.executionDate || change.after.visit_time || change.after.time || '', timing: change.after.timeWindow || '', datePending: change.after.timingStatus === 'pending_confirmation' } : null,
  };
}
function todo(plan) {
  const rows = pending(plan);
  if (!rows.length) return null;
  const patient = plan.patientId;
  return { id: `annual_execution_review_${plan._id}`, type: 'annual_execution_review', priority: 2,
    label: '方案修订·执行安排待核对', patientId: String(patient._id || patient), patientName: patient.name || '会员',
    summary: `${plan.year}年 · ${rows.length}次修订，核对是否需要调整原执行安排`,
    createdAt: rows[0].createdAt, overdue: Date.now() - new Date(rows[0].createdAt) > 86400000,
    link: `/patients/${patient._id || patient}/annual-health?year=${plan.year}&planType=${encodeURIComponent(plan.servicePlanCode || plan.planType)}#annual-execution-review`,
  };
}
// Task snapshot prevents an acknowledgement based on arrangements that changed during review.
function taskVersion(followUps, tasks) {
  const rows = [...followUps.map(r => ['followup', String(r._id), r.updatedAt, r.status]), ...tasks.map(r => ['task', String(r._id), r.updatedAt, r.status])];
  rows.sort((a,b) => `${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`));
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
module.exports = { changesForExecution, markForReview, reviews, pending, summary, todo, taskVersion };
