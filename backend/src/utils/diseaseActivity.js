const id = value => String(value?._id || value || '');
function diseaseActivity({ plans = [], records = [], tasks = [], diseases = [] }) {
  const groups = new Map(), orderPlans = new Map();
  for (const plan of plans) {
    if (plan.sourceOrderId) {
      const key = id(plan.sourceOrderId);
      orderPlans.set(key, orderPlans.has(key) ? null : id(plan));
    }
    groups.set(`plan:${id(plan)}`, { key: `plan:${id(plan)}`, planId: id(plan), title: plan.title || '就医协助', status: plan.status, date: plan.startDate || plan.createdAt, records: [], tasks: [], diseaseIds: [] });
  }
  function keyOf(source, kind) {
    const planId = id(source.sourceHealthPlanId);
    if (planId && groups.has(`plan:${planId}`)) return `plan:${planId}`;
    const orderId = id(source.sourceOrderId), linkedPlan = orderPlans.get(orderId);
    if (linkedPlan) return `plan:${linkedPlan}`;
    return orderId ? `order:${orderId}` : `${kind}:${id(source)}`;
  }
  function add(source, kind) {
    const key = keyOf(source, kind);
    if (!groups.has(key)) groups.set(key, { key, title: source.title || source.theme || '服务与跟进', status: kind === 'task' ? source.status : 'recorded', date: source.date || source.createdAt, records: [], tasks: [], diseaseIds: [] });
    const group = groups.get(key);
    group[kind === 'record' ? 'records' : 'tasks'].push(source);
    if (new Date(source.date || 0) > new Date(group.date || 0)) group.date = source.date;
  }
  records.forEach(r => add(r, 'record')); tasks.forEach(t => add(t, 'task'));
  for (const group of groups.values()) {
    const keys = new Set([group.key, ...group.records.map(r => `record:${id(r)}`), ...group.tasks.map(t => `task:${id(t)}`)]);
    for (const source of [...group.records, ...group.tasks]) {
      if (source.sourceOrderId && orderPlans.get(id(source.sourceOrderId)) !== null) keys.add(`order:${id(source.sourceOrderId)}`);
    }
    const plan = plans.find(p => id(p) === group.planId);
    if (plan?.sourceOrderId && orderPlans.get(id(plan.sourceOrderId))) keys.add(`order:${id(plan.sourceOrderId)}`);
    if (!group.planId) group.status = group.tasks.length ? 'tasks' : 'recorded';
    group.manualLinkKeys = {};
    for (const disease of diseases) {
      group.manualLinkKeys[id(disease)] = (disease.serviceLinks || []).filter(link => keys.has(link.key)).map(link => link.key);
      if ((disease.serviceLinks || []).some(link => keys.has(link.key)) || group.records.some(r => r.diseaseName && r.diseaseName === disease.name)) group.diseaseIds.push(id(disease));
    }
    group.taskCounts = group.tasks.reduce((counts, task) => { counts[task.status || 'unknown'] = (counts[task.status || 'unknown'] || 0) + 1; return counts; }, {});
  }
  return [...groups.values()].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}
module.exports = { diseaseActivity };
