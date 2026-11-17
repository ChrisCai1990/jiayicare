const id = value => String(value?._id || value || '');

function activePlan(plans, period) {
  const end = new Date(`${period.end}T23:59:59+08:00`);
  return (plans || []).filter(plan => plan.confirmedAt && new Date(plan.confirmedAt) <= end)
    .sort((a, b) => new Date(b.confirmedAt) - new Date(a.confirmedAt))[0] || null;
}

function goalReviews(plans, followups, period, services = [], healthRecords = [], reports = [], metricSourcesIncomplete = false, observationRecords = [], observationSourcesIncomplete = false, linkedRehabOrders = [], priorGoalReviews = []) {
  const plan = activePlan(plans, period);
  if (!plan) return [];
  const rows = plan.moduleData?.management_targets?.records || [];
  const periodEnd = new Date(`${period.end}T23:59:59+08:00`);
  const planStart = new Date(plan.confirmedAt);
  const activeObservations = observationRecords.filter(record => new Date(record.recordedAt) >= planStart);
  const activeStart = planStart.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const observationPeriod = { start: activeStart > period.start ? activeStart : period.start, end: period.end };
  const rehabIssuesByOrder = new Map(linkedRehabOrders.filter(order => id(order.rehabAnnualLink?.annualPlanId) === id(plan))
    .map(order => [id(order), order.rehabAnnualLink.issueIds || []]));
  return rows.filter(row => row.issueId && row.goal).slice(0, 32).map(row => {
    const tasks = (followups || []).filter(task => new Date(task.date) >= planStart && (task.managementIssueIds || []).includes(row.issueId));
    const linkedServices = (services || []).filter(service => new Date(service.date) >= planStart
      && ((service.structuredContent?.rehab?.managementIssueIds || []).includes(row.issueId)
        || (rehabIssuesByOrder.get(id(service.structuredContent?.rehab?.orderId)) || []).includes(row.issueId)));
    const prior = priorGoalReviews.find(review => (review.goalReviews || []).some(previous => previous.issueId === row.issueId
      && id(previous.annualPlanId) === id(plan) && previous.goalDimension === row.goalDimension
      && (row.goalDimension !== 'symptom' || String(previous.symptomTerm || '') === String(row.symptomTerm || ''))
      && (row.goalDimension !== 'lifestyle' || String(previous.lifestyleType || '') === String(row.lifestyleType || ''))
      && (row.goalDimension !== 'data' || JSON.stringify(previous.goalMetric || null) === JSON.stringify(row.goalMetric || null))));
    const previousGoal = prior?.goalReviews.find(previous => previous.issueId === row.issueId && id(previous.annualPlanId) === id(plan));
    return {
      issueId: row.issueId, annualPlanId: id(plan), goal: String(row.goal).slice(0, 240),
      goalDimension: ['data', 'symptom', 'lifestyle'].includes(row.goalDimension) ? row.goalDimension : '',
      baseline: String(row.baseline || '').slice(0, 500), sourceTitle: String(row.sourceTitle || '').slice(0, 240), focus: String(row.focus || '').slice(0, 500),
      symptomTerm: String(row.symptomTerm || '').slice(0, 80), lifestyleType: String(row.lifestyleType || '').slice(0, 30),
      goalMetric: row.goalMetric || null,
      metricEvidence: row.goalDimension === 'data' && row.goalMetric
        ? { ...require('./managementGoalMetrics').metricEvidence(row.goalMetric, healthRecords, reports, period), incomplete: metricSourcesIncomplete } : null,
      observationEvidence: row.goalDimension === 'symptom'
        ? require('./managementObservationEvidence').summarize(activeObservations, 'symptom', row.symptomTerm, observationSourcesIncomplete, observationPeriod)
        : row.goalDimension === 'lifestyle' && row.lifestyleType
          ? require('./managementObservationEvidence').summarize(activeObservations, row.lifestyleType, '', observationSourcesIncomplete, observationPeriod) : null,
      previousEvidence: previousGoal ? { label: String(prior.label || prior.end || '').slice(0, 60),
        observationEvidence: previousGoal.observationEvidence || null,
        metricLatest: previousGoal.metricEvidence?.ambiguous ? null : previousGoal.metricEvidence?.latest || null } : null,
      taskEvidence: tasks.slice(0, 20).map(task => ({
        followUpId: id(task), date: task.date,
        status: task.completedAt && new Date(task.completedAt) > periodEnd ? 'period_end_pending' : task.status,
        summary: String(task.completedAt && new Date(task.completedAt) > periodEnd ? task.plannedContent || '' : task.executedContent || task.content || task.plannedContent || '').slice(0, 300),
      })),
      serviceEvidence: linkedServices.slice(0, 10).map(service => ({ serviceRecordId: id(service), date: service.date,
        title: String(service.title || '').slice(0, 120), status: service.structuredContent?.rehab?.status || '',
        summary: String(service.result || '').slice(0, 300) })),
      outcome: 'unverified', outcomeNote: '',
    };
  });
}

function reviewedGoals(original, submitted) {
  if (!Array.isArray(submitted) || submitted.length !== original.length) throw new Error('请逐项核对年度管理目标');
  return original.map((row, index) => {
    const input = submitted[index];
    if (input?.issueId !== row.issueId || id(input.annualPlanId) !== id(row.annualPlanId)) throw new Error('目标来源已变化，请刷新');
    if (!['achieved', 'partial', 'not_achieved', 'unverified', 'not_applicable'].includes(input.outcome)) throw new Error('请选择目标结果');
    const note = typeof input.outcomeNote === 'string' ? input.outcomeNote.trim() : '';
    if (!note || note.length > 1000) throw new Error('请逐项填写目标结果依据或待核实内容');
    return { ...row, outcome: input.outcome, outcomeNote: note };
  });
}

module.exports = { activePlan, goalReviews, reviewedGoals };
