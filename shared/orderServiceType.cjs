// An order follows the workflow of the purchased service, not words in a free-text note.
function orderServiceType(order = {}, tasks = []) {
  const name = String(order.serviceName || '');
  const specification = String(order.specificationLabel || '');
  const workflow = String(order.serviceWorkflowSnapshot?.key || '');
  const taskKeys = tasks.map(task => String(task.workflowKey || ''));

  if (order.specialtyTermsSnapshot?.key === 'ibd' || order.specialtyService?.key === 'ibd') return 'ibd';
  if (name === '企业家健康决策计划' || taskKeys.some(key => key.startsWith('decision_referral:'))) return 'decision';
  if (/复查督办|就医提醒/.test(`${name} ${specification}`) || taskKeys.some(key => key.startsWith('medical_reminder:'))) return 'medical_reminder';
  if (order.medicalProxyPlan?.medicalEscort === true || /就医陪同|陪同就医|陪同看诊|陪同检查|陪同治疗|陪同体检|陪诊/.test(name)) return 'medical_escort';
  if (/代配药|代取药/.test(`${name} ${specification}`) || taskKeys.some(key => key.startsWith('medication_proxy:'))) return 'medication_proxy';
  if (/代配营养素/.test(name) || order.medicalProxyPlan?.supplementProxy === true) return 'supplement_proxy';
  if (/待约检|代约检|常规约检|特殊约检/.test(`${name} ${specification}`) || workflow === 'checkup_appointment'
    || taskKeys.some(key => key.startsWith('checkup_appointment:'))) return 'checkup_appointment';
  if (/专家约诊/.test(name)) return 'expert_appointment';
  if (/就医规划/.test(name)) return 'medical_planning';
  if (/医疗代诊/.test(name) || workflow === 'medical_proxy' || taskKeys.some(key => key.startsWith('medical_proxy:'))) return 'medical_proxy';
  if (workflow === 'checkup' || /^checkup_/.test(String(order.currentStage || ''))) return 'checkup';
  if (workflow === 'medical_assist' || /医务代办|就医协助|门诊一站式/.test(name)) return 'medical_assist';
  return '';
}

module.exports = { orderServiceType };
