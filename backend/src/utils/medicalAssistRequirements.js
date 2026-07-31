function formatMedicalAssistRequirements(plan) {
  if (!plan || plan.type !== 'medical_assist') return '';
  const c = plan.content || {};
  const visit = c.moduleData?.visit || {};
  const logistics = c.moduleData?.logistics || {};
  const taskRecords = c.moduleData?.tasks?.records || [];
  const tasks = c.tasks || taskRecords.map(record => record.task).filter(Boolean).join('\n');

  return [
    (c.hospital || visit.hospital) && `医院：${c.hospital || visit.hospital}`,
    (c.department || visit.department) && `科室：${c.department || visit.department}`,
    (c.expert || visit.expert) && `医生：${c.expert || visit.expert}`,
    (c.serviceDate || visit.visitDate || c.serviceTime || visit.serviceTime)
      && `服务时间：${[c.serviceDate || visit.visitDate, c.serviceTime || visit.serviceTime].filter(Boolean).join(' ')}`,
    plan.description && `代诊目的：${plan.description}`,
    tasks && `代诊要求：${tasks}`,
    (c.transport || logistics.transport) && `交通安排：${c.transport || logistics.transport}`,
    (c.hotel || logistics.hotel) && `住宿安排：${c.hotel || logistics.hotel}`,
    (c.notes || c.moduleData?.notes?.content) && `注意事项：${c.notes || c.moduleData?.notes?.content}`,
  ].filter(Boolean).join('\n');
}

function followUpTaskRequirements(followUp) {
  const plan = followUp?.sourceHealthPlanId;
  return formatMedicalAssistRequirements(plan) || followUp?.plannedContent || '';
}

module.exports = { formatMedicalAssistRequirements, followUpTaskRequirements };
