// 已有专用闭环必须继续由原工作流生成随访；通用机制只补没有后续计划的普通事件。
const SPECIALIZED_WORKFLOW_PREFIXES = [
  'medical_proxy:',
  'medication_proxy:',
  'checkup_appointment:',
  'checkup_one_stop:',
  'system:outpatient_',
];

const SPECIALIZED_SOURCE_FLAGS = [
  'generatedFromCheckupAppointment',
  'generatedFromPostCheckupSupervision',
  'generatedFromExpertAppointment',
  'generatedFromMedicalEscort',
];

function dynamicFollowUpEligibility(event = {}) {
  const workflowKey = String(event.workflowKey || '');
  if (SPECIALIZED_WORKFLOW_PREFIXES.some(prefix => workflowKey.startsWith(prefix))) {
    return { eligible: false, reason: 'specialized_workflow' };
  }
  if (SPECIALIZED_SOURCE_FLAGS.some(flag => event.formData?.[flag] === true)) {
    return { eligible: false, reason: 'specialized_source' };
  }
  if (event.sourceType === 'health_plan' && /门诊一站式|体检一站式/.test(`${event.theme || ''} ${event.planTitle || ''}`)) {
    return { eligible: false, reason: 'one_stop_service' };
  }
  if (event.existingFollowUpCount > 0) return { eligible: false, reason: 'follow_up_exists' };
  if (!event.patientId || !event.sourceId) return { eligible: false, reason: 'missing_source' };
  return { eligible: true, reason: 'generic_event' };
}

module.exports = { SPECIALIZED_WORKFLOW_PREFIXES, SPECIALIZED_SOURCE_FLAGS, dynamicFollowUpEligibility };
