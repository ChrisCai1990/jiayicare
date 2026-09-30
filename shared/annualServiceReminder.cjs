// Internal reminders reuse the recommendation; never create an order or FollowUp.
function day(now = new Date()) { return new Date(new Date(now).getTime() + 8 * 3600000).toISOString().slice(0, 10); }
function scheduledDue(row, now = new Date()) {
  return row.followUpReminderEnabled === true && /^\d{4}-\d{2}-\d{2}$/.test(row.plannedFollowUpDate || '') && row.plannedFollowUpDate <= day(now);
}
function actionable(row, now = new Date()) {
  return row.status === 'published' && !row.handledAt && row.response !== 'declined' && (row.response === 'interested' || scheduledDue(row, now));
}
function query(now = new Date()) {
  return { status: 'published', handledAt: null, $or: [
    { response: 'interested' },
    { followUpReminderEnabled: true, response: { $ne: 'declined' }, plannedFollowUpDate: { $gt: '', $lte: day(now) } },
  ] };
}
function todo(row, now = new Date()) {
  const interested = row.response === 'interested';
  const createdAt = interested ? row.respondedAt || row.updatedAt : new Date(row.plannedFollowUpDate + 'T00:00:00+08:00');
  return { id: 'annual_service_interest_' + row._id, type: 'annual_service_interest',
    label: interested ? '年度服务建议·客户需要协助' : '年度服务建议·到期联系', priority: interested ? 1 : 2,
    patientName: row.patientId.name || '会员', patientId: String(row.patientId._id),
    summary: row.recommendation + (interested ? '；请联系客户确认需求，再按现有服务流程发起。' : '；计划跟进日期：' + row.plannedFollowUpDate + '，请联系客户并记录结果。'),
    createdAt, overdue: interested ? new Date(now) - new Date(createdAt) > 86400000 : row.plannedFollowUpDate < day(now),
    link: '/patients/' + row.patientId._id + '/annual-health?year=' + row.planId.year + '&recommendationId=' + row._id + '#service-recommendation-' + row._id,
  };
}
module.exports = { day, scheduledDue, actionable, query, todo };
