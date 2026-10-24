const date = value => {
  if (!value) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text.slice(0, 30);
};
const text = value => Array.isArray(value) ? value.filter(Boolean).join('、') : String(value || '').trim();
const pending = { verification: '待核实' };

function buildMdtEvidence(patient, reports = [], medications = []) {
  const records = Array.isArray(patient.diseaseRecords) && patient.diseaseRecords.length
    ? patient.diseaseRecords : [{ name: '旧版病历', ...(patient.medicalRecord || {}) }];
  const timelineRows = [];
  for (const record of records) {
    const label = `专病档案：${record.name || '未命名'}`;
    const summary = record.summary || {};
    if (summary.chiefComplaint || summary.presentIllness || summary.initialDiagnosis) timelineRows.push({
      date: date(summary.initialOccurredAt), event: [summary.chiefComplaint, summary.presentIllness].filter(Boolean).join('；'),
      symptoms: '', assessment: text(summary.initialDiagnosis), response: '', source: `${label}／首次概况`,
      sourceDate: date(summary.initialOccurredAt || summary.updatedAt), ...pending,
    });
    for (const entry of record.courseEntries || []) {
      if (entry.cancelledAt || entry.isCancelled) continue;
      const original = entry.outpatientRecord || {};
      timelineRows.push({ date: date(entry.occurredAt), event: text(entry.content || original.presentIllness || original.chiefComplaint),
        symptoms: text(entry.symptoms), assessment: text(entry.diagnosis || original.diagnoses),
        response: text(entry.treatmentResponse), source: [label, entry.sourceLabel || entry.sourceInstitution].filter(Boolean).join('／'),
        sourceDate: date(entry.occurredAt), ...pending });
    }
  }
  timelineRows.sort((a, b) => a.date.localeCompare(b.date));
  const treatmentRows = medications.filter(med => med.name && !['pending', 'rejected'].includes(med.aiStatus)).map(med => ({
    treatment: text(med.name), period: [med.startDate, [med.dosage, med.frequency].filter(Boolean).join(' ')].filter(Boolean).join('／'),
    response: med.stopReason ? `停用原因：${text(med.stopReason)}` : '', currentStatus: med.stopped || med.active === false ? '已停用' : '档案记录在用（需核实）',
    source: '用药记录', sourceDate: date(med.startDate || med.createdAt), ...pending,
  }));
  const testRows = reports.flatMap(report => {
    const base = { date: date(report.date), test: text(report.title), interpretation: '', source: `已审核报告：${text(report.title)}`,
      sourceDate: date(report.date), ...pending };
    const excerpts = (report.findings || []).slice(0, 30);
    return excerpts.length ? excerpts.map(item => ({ ...base, originalResult: `报告快照摘录：${text(item)}` }))
      : report.conclusion ? [{ ...base, originalResult: `报告结论摘录：${text(report.conclusion)}` }] : [];
  });
  const tables = { timelineRows: timelineRows.slice(-80), triggerRows: [], treatmentRows: treatmentRows.slice(0, 80),
    testRows: testRows.slice(0, 80), questionRows: [] };
  return { tables, counts: { diseaseRecords: records.filter(row => row.summary || row.courseEntries?.length).length,
    courseEntries: timelineRows.length, medications: treatmentRows.length, reports: reports.length, testExcerpts: testRows.length } };
}

module.exports = { buildMdtEvidence };
