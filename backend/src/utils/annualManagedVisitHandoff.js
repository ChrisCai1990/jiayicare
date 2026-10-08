// Read-only projection from an explicitly linked annual managed request to its
// existing one-stop executor tasks. No duplicate task or service is created.
const id = value => String(value?._id || value || '');
const target = task => {
  if (task.taskRole !== 'executor' || !/门诊一站式.*(?:首次代诊开检查单|检查及专家门诊陪诊与归档)/.test(task.theme || '')) return null;
  const patientId = id(task.patientId);
  if (task.sourceType === 'health_plan' && task.sourceHealthPlanId) return { type: 'health_plan', id: id(task.sourceHealthPlanId), patientId };
  if (task.sourceType === 'order' && task.sourceOrderId) return { type: 'order', id: id(task.sourceOrderId), patientId };
  return null;
};
const key = (type, targetId, patientId) => `${type}:${targetId}:${patientId}`;

async function handoffsForTasks(tasks, models = {}) {
  const targets = tasks.map(target).filter(Boolean);
  const map = new Map();
  if (!targets.length) return map;
  const Link = models.Link || require('../models/FollowUpServiceLink');
  const clauses = ['health_plan', 'order'].map(type => ({ targetType: type, targetId: { $in: targets.filter(t => t.type === type).map(t => t.id) } }));
  const links = await Link.find({ $or: clauses, status: { $in: ['waiting', 'completed'] } }).select('patientId targetType targetId requestTaskId').lean();
  if (!links.length) return map;
  const FollowUp = models.FollowUp || require('../models/FollowUp');
  const requests = await FollowUp.find({ _id: { $in: links.map(link => link.requestTaskId) }, sourceType: 'annual_service', workflowKey: 'service_request' })
    .select('patientId formData.serviceRequest').lean();
  const requestsById = new Map(requests.map(request => [id(request._id), request]));
  for (const link of links) {
    const request = requestsById.get(id(link.requestTaskId));
    const snapshot = request?.formData?.serviceRequest?.itemSnapshot;
    if (request?.formData?.serviceRequest?.mode !== 'managed' || id(request.patientId) !== id(link.patientId) || !Array.isArray(snapshot?.visitItems) || snapshot.visitItems.length < 2) continue;
    const mapKey = key(link.targetType, id(link.targetId), id(link.patientId));
    const existing = map.get(mapKey) || [];
    const seen = new Set(existing.map(item => `${item.moduleKey}:${item.recordIndex}:${item.title}`));
    for (const item of snapshot.visitItems) {
      const itemKey = `${item.moduleKey}:${item.recordIndex}:${item.title}`;
      if (!seen.has(itemKey)) { existing.push(item); seen.add(itemKey); }
    }
    map.set(mapKey, existing);
  }
  return new Map(targets.map(t => [key(t.type, t.id, t.patientId), map.get(key(t.type, t.id, t.patientId)) || []]));
}

function handoffForTask(task, map) {
  const t = target(task);
  return t ? map.get(key(t.type, t.id, t.patientId)) || [] : [];
}

module.exports = { handoffsForTasks, handoffForTask };
