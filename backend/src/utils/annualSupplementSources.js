function ids(value) {
  if (!Array.isArray(value) || value.length > 30 || value.some(id => !/^[a-f\d]{24}$/i.test(String(id)))) throw Object.assign(new Error('补充依据选择无效'), { statusCode: 400 });
  return [...new Set(value.map(String))].sort();
}
async function loadSupplement(input, patientId, Review, Report) {
  if (!input) return null;
  if (input.baseModuleData != null && (typeof input.baseModuleData !== 'object' || Array.isArray(input.baseModuleData))) throw Object.assign(new Error('原方案结构无效'), { statusCode: 400 });
  const reviewIds = ids(input.reviewIds || []), reportIds = ids(input.reportIds || []);
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 4000 || (note && input.noteConfirmed !== true)) throw Object.assign(new Error('请先由顾问确认补充意见，最多4000字'), { statusCode: 400 });
  if (!reviewIds.length && !reportIds.length && !note) throw Object.assign(new Error('请选择补充依据或填写已确认意见'), { statusCode: 400 });
  const reviews = await Review.find({ _id: { $in: reviewIds }, user: patientId, status: { $ne: 'archived' }, 'conclusion.status': 'confirmed' }).select('title reviewType conclusion updatedAt').sort({ _id: 1 }).lean();
  const reports = await Report.find({ _id: { $in: reportIds }, user: patientId, audit_status: 'audited' }).select('title checkDate reportItems reviewRevision').sort({ _id: 1 }).lean();
  if (reviews.length !== reviewIds.length || reports.length !== reportIds.length) throw Object.assign(new Error('部分依据已变化、未确认或不属于该客户，请刷新重选'), { statusCode: 409 });
  return { reviews, reports, note, baseModuleData: input.baseModuleData || {} };
}
module.exports = { loadSupplement, ids };
