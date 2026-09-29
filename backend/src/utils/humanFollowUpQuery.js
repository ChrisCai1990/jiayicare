// The personal workbench excludes customer self-service reminders unless a
// human handoff was explicitly requested. Apply this BEFORE counting/paging.
const humanFollowUpQuery = {
  sourceType: { $nin: ['order', 'health_plan'] },
  $or: [
    { tags: '人工跟进' },
    { $nor: [
      { sourceType: 'medication_reminder' },
      { sourceType: 'scheduled', $or: [{ 'checkInItems.0': { $exists: true } }, { theme: /^【?日常监测/ }] },
      { tags: 'AI自动计划', $expr: { $regexMatch: { input: { $concat: [
        { $ifNull: ['$theme', ''] }, ' ',
        { $reduce: { input: { $ifNull: ['$tags', []] }, initialValue: '', in: { $concat: ['$$value', ' ', '$$this'] } } },
      ] }, regex: '(用药|营养素).*提醒|提醒.*(用药|营养素)' } } },
    ] },
  ],
};
function timeBuckets(dayStart) {
  let today = new Date(dayStart || NaN);
  if (!Number.isFinite(today.getTime())) {
    const now = new Date();
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const after = days => new Date(today.getTime() + days * 86400000);
  return { all: {}, overdue: { date: { $lt: today } }, today: { date: { $gte: today, $lt: after(1) } },
    week: { date: { $gte: after(1), $lt: after(8) } }, month: { date: { $gte: after(8), $lt: after(31) } },
    later: { $or: [{ date: { $gte: after(31) } }, { date: null }] } };
}
module.exports = { humanFollowUpQuery, timeBuckets };
