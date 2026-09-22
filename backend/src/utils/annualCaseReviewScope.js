function annualCaseReviewQuery(patientId, year) {
  const start = new Date(`${year}-01-01T00:00:00+08:00`);
  const end = new Date(`${Number(year) + 1}-01-01T00:00:00+08:00`);
  return { user: patientId, status: { $ne: 'archived' }, $and: [
    { $or: [{ reviewType: { $in: ['annual', 'medical', 'specialty'] } }, { reviewType: { $exists: false }, title: /年度管理研判/ }] },
    { $or: [{ 'conclusion.confirmedAt': { $gte: start, $lt: end } }, { createdAt: { $gte: start, $lt: end } }] },
  ] };
}
function markRequiredCaseReviews(reviews, requiredIds = []) {
  const ids = new Set(requiredIds.map(String));
  const rows = reviews.map(item => ({ ...item, required: ids.has(String(item._id)) }));
  for (const id of ids) if (!rows.some(item => String(item._id) === id)) rows.push({ _id: id, required: true, title: '已指定研判不可用，请核对或取消指定', conclusion: { status: 'missing' } });
  return rows;
}
module.exports = { annualCaseReviewQuery, markRequiredCaseReviews };
