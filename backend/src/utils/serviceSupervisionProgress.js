const care = require('../../../shared/careFlow.cjs');

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
];
const medication = [
  ['intake', '规划师核对信息'], ['advisor', '顾问评估'],
  ['review', '规划师确认'], ['booking', '健管预约'],
  ['planner', '规划师分配人员'], ['execute', '就医专员配药配送'],
];

function ordered(stages, stage) {
  const index = stages.findIndex(([key]) => key === stage);
  if (index < 0) return null;
  return { stage, label: stages[index][1], step: index + 1, total: stages.length,
    steps: stages.map(([key, label], i) => ({ key, label, state: i < index ? 'past' : i === index ? 'current' : 'future' })) };
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

function serviceProgress(type, source, tasks, current) {
  if (type === 'flow') {
    const path = care.pathFor(source.state || {});
    const progress = ordered(path.map(key => [key, care.labels[key] || key]), source.state?.stage);
    if (progress) return { ...progress, note: '后续随访步骤按规划师判断执行。' };
  }
  if (type === 'order') {
    const stage = source.currentStage || 'intake';
    if (source.serviceName === '企业家健康决策计划') {
      const progress = ordered(decision, stage);
      if (progress) return progress;
    }
    if (source.serviceWorkflowSnapshot?.key === 'checkup' || stage.startsWith('checkup_')) {
      const progress = ordered(checkup, stage);
      if (progress) return progress;
    }
    if (tasks.some(t => String(t.workflowKey || '').startsWith('medication_proxy:'))) {
      const progress = ordered(medication, stage);
      if (progress) return progress;
    }
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
