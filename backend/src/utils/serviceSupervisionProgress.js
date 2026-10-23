const care = require('../../../shared/careFlow.cjs');
const { orderServiceType } = require('./orderServiceType');

const decision = [
  ['intake', '规划师确认客户需求'], ['advisor', '顾问确定方案并转介'],
  ['booking', '健管预约及客户沟通'], ['specialist', '专科解析并回复'],
  ['advisor_review', '顾问审核归档'], ['planner_final', '规划师最终验收'],
];
const checkup = [
  ['checkup_manager_booking', '健管预约检查'],
  ['checkup_medical_execution', '就医专员执行检查'],
  ['checkup_manager_review', '健管审核资料'],
  ['checkup_advisor_review', '顾问审核随访'],
  ['pending_closure', '规划师验收结案'],
];
const checkupAppointment = [
  ['intake', '规划师核对检查需求'],
  ['checkup_manager_booking', '健管确认检查预约'],
  ['checkup_medical_execution', '就医专员执行检查'],
  ['checkup_manager_review', '健管审核报告与病历'],
  ['checkup_advisor_review', '顾问审核后续随访'],
  ['pending_closure', '规划师验收结案'],
];
const medication = [
  ['intake', '规划师核对信息'], ['advisor', '顾问评估'],
  ['review', '规划师确认'], ['booking', '健管预约'],
  ['planner', '规划师分配人员'], ['execute', '就医专员配药配送'],
  ['pending_closure', '规划师验收结案'],
];
const ibd = [
  ['intake', '规划师接单并核对需求'],
  ['ibd_advisor', '顾问确定首诊方案'],
  ['ibd_booking', '健管确认首诊预约'],
  ['ibd_planner_assignment', '规划师指定陪诊人员'],
  ['ibd_escort_meeting', '陪诊人员确认碰面安排'],
  ['ibd_awaiting_first_visit', '年度管理与陪诊'],
  ['ibd_annual_review', '年度回顾与结案'],
];
const medicalAssist = [
  ['intake', '规划师核对需求并接单'],
  ['plan_draft', '制定并推送就医协助方案'],
  ['service_execution', '服务执行与督办'],
  ['pending_closure', '规划师验收结案'],
];
const medicalProxy = [
  ['intake', '规划师核对代诊需求'],
  ['plan_review', '确认代诊方案与资料'],
  ['arrangement', '预约并安排代诊人员'],
  ['execution', '代诊执行与资料归档'],
  ['pending_closure', '规划师验收结案'],
];
const expertAppointment = [
  ['intake', '规划师核对约诊需求'],
  ['booking', '健管确认专家预约'],
  ['post_visit_audit', '健管审核就诊资料'],
  ['followup_review', '顾问审核约诊后随访'],
  ['pending_closure', '规划师验收结案'],
];
const supplementProxy = [
  ['intake', '确认营养素采购需求'],
  ['booking', '健管确认采购安排'],
  ['planner', '规划师安排采购人员'],
  ['execute', '采购配送并记录交付'],
  ['pending_closure', '规划师验收结案'],
];
const medicalReminder = [
  ['intake', '核对复查需求'],
  ['advisor_review', '顾问审核复查随访计划'],
  ['documents', '健管核对复查资料'],
  ['plan_review', '顾问确认后续安排'],
  ['pending_closure', '规划师验收结案'],
];
const medicalPlanning = [
  ['intake', '规划师确认就医规划需求'],
  ['advisor', '顾问评估并提出就医建议'],
  ['pending_closure', '规划师与客户沟通并结案'],
];
const medicalEscort = [
  ['intake', '规划师确认陪同需求'],
  ['arrangement', '规划师安排陪同方案与人员'],
  ['booking', '健管确认陪同预约'],
  ['execution', '就医专员陪同及资料审核'],
  ['pending_closure', '规划师验收结案'],
];
const adHocEscort = [
  ['arrangement', '规划师安排现场加诊人员'],
  ['execution', '就医专员执行现场加诊'],
  ['post_visit_audit', '健管审核就诊资料'],
  ['pending_closure', '规划师验收结案'],
];

function ordered(stages, stage) {
  const index = stages.findIndex(([key]) => key === stage);
  if (index < 0) return null;
  return { stage, label: stages[index][1], step: index + 1, total: stages.length,
    steps: stages.map(([key, label], i) => ({ key, label, state: i < index ? 'past' : i === index ? 'current' : 'future' })) };
}
function unmapped(stages, stage) {
  return { stage, label: `当前环节待核对（${stage || '未记录'}）`, step: null, total: stages.length,
    steps: stages.map(([key, label]) => ({ key, label, state: 'future' })),
    note: '原订单状态未对应到预设环节，请在原服务核对进度。' };
}

function taskProgress(tasks, current) {
  const meaningful = tasks.filter(t => t.taskRole !== 'supervisor' && t.workflowKey !== 'medication_proxy:progress' && t.status !== 'cancelled');
  const unique = new Map();
  meaningful.forEach(t => {
    const key = t.workflowKey || String(t._id);
    const existing = unique.get(key);
    if (!existing || (existing.status === 'completed' && t.status !== 'completed')
      || (existing.status === t.status && new Date(t.updatedAt || 0) > new Date(existing.updatedAt || 0))) unique.set(key, t);
  });
  const steps = [...unique.values()].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .map(t => ({ key: String(t._id), label: t.theme || '服务任务',
      state: t.status === 'completed' ? 'past' : t.isBlocked ? 'blocked' : 'current',
      statusLabel: t.status === 'completed' ? '已完成' : t.isBlocked ? '待前置环节' : t.status === 'missed' ? '已逾期' : t.status === 'in_progress' ? '办理中' : '待办理' }));
  const generatedTotal = steps.length;
  const generatedCompleted = steps.filter(step => step.state === 'past').length;
  if (!steps.length) steps.push({ key: 'current', label: current.map(c => c.label).join('、') || '当前环节待核对', state: 'current', statusLabel: '待核对' });
  return { label: current.map(c => c.label).join('、') || '当前环节待核对', step: null, total: null,
    steps, observed: true, generatedTotal, generatedCompleted };
}

function serviceProgress(type, source, tasks, current, now = new Date()) {
  if (type === 'flow') {
    const path = care.pathFor(source.state || {});
    const progress = ordered(path.map(key => [key, care.labels[key] || key]), source.state?.stage);
    if (progress) return { ...progress, note: '后续随访步骤按规划师判断执行。' };
  }
  if (type === 'order') {
    const stage = source.currentStage || 'intake';
    const serviceType = orderServiceType(source, tasks);
    if (serviceType === 'ibd') {
      const period = source.specialtyService || {};
      const reviewDue = stage === 'ibd_awaiting_first_visit' && period.endsAt && new Date(period.endsAt) <= now;
      const progress = ordered(ibd, reviewDue ? 'ibd_annual_review' : stage);
      if (progress) {
        const used = Number(period.usedEscorts || 0);
        const included = Number(period.includedEscorts || source.specialtyTermsSnapshot?.includedEscorts || 0);
        return { ...progress, note: included ? `年度服务已登记陪诊 ${used}/${included} 次；复诊与后续随访按专科方案推进。` : '复诊与后续随访按专科方案推进。' };
      }
    }
    if (serviceType === 'decision') {
      const progress = ordered(decision, stage);
      if (progress) return progress;
    }
    if (serviceType === 'medical_reminder') {
      const progress = ordered(medicalReminder, stage);
      if (progress) return progress;
    }
    if (serviceType === 'checkup_appointment') {
      const progress = ordered(checkupAppointment, stage);
      if (progress) return progress;
    }
    if (serviceType === 'checkup') {
      const progress = ordered(checkup, stage);
      if (progress) return progress;
    }
    if (serviceType === 'medication_proxy') {
      const progress = ordered(medication, stage);
      if (progress) return progress;
    }
    if (serviceType === 'supplement_proxy') {
      const progress = ordered(supplementProxy, stage);
      if (progress) return progress;
    }
    if (serviceType === 'medical_escort') {
      const hasExecution = tasks.some(t => t.sourceHealthPlanId && ['executor', 'supervisor'].includes(t.taskRole) && t.status !== 'cancelled');
      const escortStage = stage === 'pending_closure' ? 'pending_closure'
        : ['execute', 'post_visit_audit', 'post_visit_review', 'followup_review', 'service_execution'].includes(stage) || hasExecution ? 'execution'
          : ['planner', 'plan_draft'].includes(stage) || source.linkedServicePlan ? 'arrangement'
            : stage === 'booking' ? 'booking' : 'intake';
      const progress = ordered(source.medicalProxyPlan?.adHocConsultation ? adHocEscort : medicalEscort, escortStage);
      if (progress) return { ...progress, note: '预约、陪同和资料审核以原服务记录为准。' };
    }
    if (serviceType === 'expert_appointment') {
      const pendingReview = tasks.some(t => /^(expert_appointment_followup):/.test(t.sourceScheduleKey || '')
        && ['planned', 'in_progress', 'missed'].includes(t.status));
      const audited = tasks.some(t => t.workflowKey === 'medical_proxy:post_visit_audit' && t.status === 'completed');
      const booked = tasks.some(t => t.workflowKey === 'medical_proxy:booking' && t.status === 'completed');
      const currentStage = pendingReview || (stage === 'intake' && audited) ? 'followup_review'
        : stage === 'intake' && booked ? 'post_visit_audit'
          : stage === 'appointment_review' ? 'booking'
            : stage === 'post_visit_review' ? 'followup_review' : stage;
      const progress = ordered(expertAppointment, currentStage);
      if (progress) return progress;
    }
    if (serviceType === 'medical_planning') {
      const progress = ordered(medicalPlanning, ['planner', 'planner_followup'].includes(stage) ? 'pending_closure' : stage);
      if (progress) return progress;
    }
    if (serviceType === 'medical_proxy') {
      const serviceStage = ['collect', 'audit', 'advisor'].includes(stage) ? 'plan_review'
        : ['planner', 'booking'].includes(stage) ? 'arrangement'
          : ['execute', 'post_visit_audit', 'post_visit_review', 'followup_review'].includes(stage) ? 'execution'
            : stage === 'pending_closure' ? 'pending_closure' : stage === 'intake' ? 'intake' : null;
      const progress = ordered(medicalProxy, serviceStage);
      if (progress) return { ...progress, note: '各阶段的资料审核、预约和执行记录以原服务任务为准。' };
    }
    if (serviceType === 'medical_assist') {
      const hasExecution = tasks.some(t => t.sourceHealthPlanId && ['executor', 'supervisor'].includes(t.taskRole) && t.status !== 'cancelled');
      const serviceStage = stage === 'pending_closure' ? 'pending_closure'
        : hasExecution || ['booking', 'execute', 'post_visit_audit'].includes(stage) ? 'service_execution'
          : stage === 'plan_draft' || source.linkedServicePlan ? 'plan_draft' : 'intake';
      return { ...ordered(medicalAssist, serviceStage), note: '具体执行事项以正式就医协助方案为准。' };
    }
    const knownPath = { decision, ibd, checkup, checkup_appointment: checkupAppointment,
      medication_proxy: medication, supplement_proxy: supplementProxy,
      medical_escort: source.medicalProxyPlan?.adHocConsultation ? adHocEscort : medicalEscort,
      expert_appointment: expertAppointment, medical_planning: medicalPlanning,
      medical_proxy: medicalProxy, medical_reminder: medicalReminder }[serviceType];
    if (knownPath) return unmapped(knownPath, stage);
  }
  if (type === 'insurance' && source.steps?.length) {
    const steps = source.steps.map((item, index) => ({ key: String(item._id || index), label: item.title,
      state: item.status === 'completed' || item.status === 'skipped' ? 'past' : 'future' }));
    const firstPending = steps.findIndex(step => step.state === 'future');
    if (firstPending >= 0) steps[firstPending].state = 'current';
    return { label: firstPending >= 0 ? steps[firstPending].label : current.map(c => c.label).join('、') || '步骤已办理，待核对结案',
      step: firstPending >= 0 ? firstPending + 1 : null, total: steps.length, steps };
  }
  return taskProgress(tasks, current);
}

module.exports = { serviceProgress };
