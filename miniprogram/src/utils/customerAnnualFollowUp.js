// Customer-facing projection of an annual follow-up. Never expose the raw
// internal execution note: it may contain evidence, source IDs and staff steps.
const field = (text, label) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text || '').match(new RegExp(`(?:^|\\n)${escaped}[:：]\\s*([^\\n；;]+)`, 'm'))?.[1]?.trim() || '';
};
const dateField = (text, label) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text || '').match(new RegExp(`${escaped}[:：]\\s*(\\d{4}-\\d{2}-\\d{2})`))?.[1] || '';
};
const short = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 36);

function customerAnnualFollowUp(followUp) {
  if (!followUp?.sourceAnnualPlanId) return null;
  const raw = followUp.plannedContent || followUp.content || '';
  const key = String(followUp.sourceScheduleKey || '').split(':')[0];
  const hospital = field(raw, '就医/会诊医院') || field(raw, '计划体检机构') || field(raw, '机构');
  const department = field(raw, '科室');
  const item = field(raw, '项目');
  const visitDate = dateField(raw, '建议就医/检查日期');
  const checkupDate = dateField(raw, '建议体检日期');
  const title = key === 'medical_treatment' ? (department ? `${short(department)}就医` : '就医安排')
    : key === 'annual_checkup' ? '年度体检'
    : key === 'abnormal_followup' ? (item ? `${short(item)}复查` : '复查安排')
    : key === 'nutrition-assessment' ? '营养评估'
    : short(String(followUp.theme || '健康安排').split(' · ')[0]) || '健康安排';
  const details = [];
  if (visitDate) details.push(`建议就医：${visitDate}`);
  if (checkupDate) details.push(`计划体检：${checkupDate}`);
  if (hospital) details.push(`机构：${short(hospital)}`);
  if (department && key !== 'medical_treatment') details.push(`科室：${short(department)}`);
  if (key === 'annual_checkup') {
    if (/已安排陪检服务/.test(raw)) details.push('服务方式：陪检');
    else if (followUp.deliveryMode === 'reminder') details.push('服务方式：仅提醒');
  }
  if (!details.length && key === 'nutrition-assessment') details.push('营养师将与您确认评估安排');
  return { title, summary: details.slice(0, 2).join(' · '), details };
}

module.exports = { customerAnnualFollowUp };
