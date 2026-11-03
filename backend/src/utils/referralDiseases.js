function selectReferralDiseases(body, records) {
  const ids = Array.isArray(body.linkedDiseaseRecordIds) ? [...new Set(body.linkedDiseaseRecordIds.map(String))]
    : body.linkedDiseaseRecordId ? [String(body.linkedDiseaseRecordId)] : [];
  const selected = ids.length ? ids.map(id => records.find(r => String(r._id) === id))
    : !Array.isArray(body.linkedDiseaseRecordIds) && body.linkedDiseaseName ? records.filter(r => r.name === body.linkedDiseaseName) : [];
  if (selected.some(r => !r)) throw new Error('所选专病不属于该客户或已删除，请刷新后重新选择');
  return selected;
}
function diseaseSnapshot(disease) {
  return { name: disease.name, summary: disease.summary || {}, capturedAt: new Date(),
    recentCourseEntries: [...(disease.courseEntries || [])].sort((a,b) => new Date(b.occurredAt || b.recordedAt || 0) - new Date(a.occurredAt || a.recordedAt || 0)).slice(0,10)
      .map(e => ({ occurredAt:e.occurredAt || e.recordedAt || null, content:e.content || e.symptoms || '', examination:e.examination || '', diagnosis:e.diagnosis || '', medicationChange:e.medicationChange || '', treatmentResponse:e.treatmentResponse || '', nextPlan:e.nextPlan || '' })) };
}
module.exports = { selectReferralDiseases, diseaseSnapshot };
