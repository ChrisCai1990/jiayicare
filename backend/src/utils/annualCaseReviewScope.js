function annualCaseReviewQuery(patientId, year) {
  const start = new Date(`${year}-01-01T00:00:00+08:00`);
  const end = new Date(`${Number(year) + 1}-01-01T00:00:00+08:00`);
  return { user: patientId, status: { $ne: 'archived' }, $and: [
    { $or: [{ reviewType: { $in: ['annual', 'medical', 'specialty'] } }, { reviewType: { $exists: false }, title: /年度管理研判/ }] },
    { $or: [{ 'conclusion.confirmedAt': { $gte: start, $lt: end } }, { createdAt: { $gte: start, $lt: end } }] },
  ] };
}
module.exports = { annualCaseReviewQuery };
