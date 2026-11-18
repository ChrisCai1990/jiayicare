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
const short = (value, max = 42) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanAction = value => {
  const text = short(value, 72);
  return /^(?:按审核后安排执行|按计划执行|配合执行|待确认|无)$/.test(text) ? '' : text;
};

function customerAnnualFollowUp(followUp) {
  if (!followUp?.sourceAnnualPlanId) return null;
  if (followUp.customerAnnual?.title && Array.isArray(followUp.customerAnnual.details)) return followUp.customerAnnual;
  const raw = followUp.plannedContent || followUp.content || '';
  const key = String(followUp.sourceScheduleKey || '').split(':')[0];
  const hospital = field(raw, '就医/会诊医院') || field(raw, '计划体检机构') || field(raw, '机构');
  const department = field(raw, '科室');
  const item = field(raw, '本次复查项目') || field(raw, '项目');
  const visitDate = dateField(raw, '建议就医/检查日期') || dateField(raw, '建议就医');
  const checkupDate = dateField(raw, '建议体检日期') || dateField(raw, '计划体检');
  const goal = short(field(raw, '管理目标'), 70);
  const customerAction = cleanAction(field(raw, '客户行动'));
  const standardPlan = short(field(raw, '标准方案'), 24);
  const evalItems = short(field(raw, '本次评估内容'), 30);
  const title = key === 'medical_treatment' ? (department ? `${short(department, 12)}就医` : (/^.{1,12}就医$/.test(followUp.theme || '') ? followUp.theme : '就医安排'))
    : key === 'annual_checkup' ? '年度体检'
    : key === 'abnormal_followup' ? (item ? `${short(item, 15)}复查` : '复查安排')
    : key === 'nutrition-assessment' ? '营养评估'
    : short(String(followUp.theme || '健康安排').split(' · ')[0], 24) || '健康安排';
  const action = customerAction || (key === 'medical_treatment' ? (followUp.formData?.bookingRequest?.required ? '与健康顾问确认预约，并按安排就诊' : '确认就医时间，并按安排就诊')
    : key === 'abnormal_followup' ? `按计划完成${item ? short(item, 20) : '相关项目'}复查，保留检查结果`
    : key === 'annual_checkup' ? (followUp.deliveryMode === 'reminder' ? '确认体检时间，并按计划完成体检' : '与健康顾问确认体检安排，并按时完成体检')
    : key === 'nutrition-assessment' ? '与营养师确认评估时间及所需资料'
    : key === 'quarterly_eval' ? `配合${evalItems || '季度'}评估，反馈近期变化`
    : key === 'personalized' ? `参加${standardPlan || '本次'}随访，反馈近期变化`
    : key === 'health-data' ? '记录健康数据，并在随访时反馈变化'
    : key === 'vaccine' ? '确认接种安排，并按计划接种'
    : '按计划配合本次健康服务');
  const details = [`需要您完成：${action}`];
  if (goal) details.push(`目标：${goal}`);
  if (visitDate) details.push(`建议就医：${visitDate}`);
  if (checkupDate) details.push(`计划体检：${checkupDate}`);
  if (hospital) details.push(`机构：${short(hospital)}`);
  if (department && key !== 'medical_treatment') details.push(`科室：${short(department)}`);
  if (key === 'annual_checkup') {
    if (/已安排陪检服务/.test(raw)) details.push('服务方式：陪检');
    else if (followUp.deliveryMode === 'reminder') details.push('服务方式：仅提醒');
  }
  return { title, summary: `${action}${hospital ? ` · ${short(hospital, 24)}` : ''}`, details };
}

module.exports = { customerAnnualFollowUp };
