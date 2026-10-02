const router = require('express').Router();
const staffAuth = require('../middleware/staffAuth');
const User = require('../models/User');
const FollowUp = require('../models/FollowUp');
const Request = require('../models/ServiceSupervisionRequest');
const { loadServices, id } = require('../utils/advisorSupervision');
const fail = (message, statusCode = 409) => { throw Object.assign(new Error(message), { statusCode }); };
const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(e.statusCode || 500).json({ success: false, message: e.statusCode ? e.message : '督办信息处理失败，请稍后重试' }); } };
router.use(staffAuth, (req, res, next) => req.staff.staffStatus === 'inactive' ? res.status(403).json({ message: '账号已停用' }) : next());
const scope = actor => ({ tenantId: actor.tenantId || null });
const canReceive = (row, request) => request.kind === 'coordinate' ? row.coordinator?.id === id(request.recipientId) : row.current.some(c => c.person?.id === id(request.recipientId));
async function inbox(actor) {
  const requests = await Request.find({ ...scope(actor), recipientId: actor._id, handledAt: null }).sort({ createdAt: -1 }).lean();
  if (!requests.length) return [];
  const ids = [...new Set(requests.map(r => id(r.patientId)))];
  const [services, patients] = await Promise.all([
    loadServices(actor, { patientIds: ids, includeOwn: true }),
    User.find({ ...scope(actor), _id: { $in: ids }, isDeleted: { $ne: true } }).select('assignedFamilyDoctor').lean(),
  ]);
  const advisor = new Map(patients.map(p => [id(p), id(p.assignedFamilyDoctor)]));
  const rows = new Map(services.map(s => [s.key, s]));
  // Closed services and transferred responsibilities stop producing pending work;
  // immutable correspondence remains available in the service's audit trail.
  return requests.flatMap(r => {
    const service = rows.get(r.serviceKey);
    return service && advisor.get(id(r.patientId)) === id(r.senderId) && canReceive(service, r) ? [{ ...r, service }] : [];
  });
}
router.get('/', wrap(async (req, res) => {
  const services = req.staff.role === 'familyDoctor' ? await loadServices(req.staff) : [];
  const keys = services.map(s => s.key);
  const history = keys.length ? await Request.find({ ...scope(req.staff), serviceKey: { $in: keys } }).sort({ createdAt: -1 }).lean() : [];
  res.json({ success: true, data: { services: services.map(s => ({ ...s, history: history.filter(r => r.serviceKey === s.key),
    attention: s.attention || history.some(r => r.serviceKey === s.key && id(r.senderId) === id(req.staff) && r.kind === 'coordinate' && !r.handledAt && canReceive(s, r)),
  })), inbox: await inbox(req.staff) } });
}));
router.get('/tasks/:id', wrap(async (req, res) => {
  if (!require('mongoose').isValidObjectId(req.params.id)) fail('任务ID无效', 400);
  const task = await FollowUp.findById(req.params.id).select('patientId theme status assignedTo plannedContent content executedContent progressRecords').lean();
  if (!task) fail('原任务不存在', 404);
  const patient = await User.findOne({ _id: task.patientId, ...scope(req.staff), isDeleted: { $ne: true } }).select('assignedFamilyDoctor').lean();
  if (!patient) fail('无本客户权限', 403);
  const services = await loadServices(req.staff, { patientIds: [task.patientId], includeOwn: true });
  const service = services.find(s => s.current.some(c => c.taskId === id(task)));
  const isAdvisor = req.staff.role === 'familyDoctor' && id(patient.assignedFamilyDoctor) === id(req.staff);
  const isRecipient = service && (await inbox(req.staff)).some(r => r.serviceKey === service.key);
  if (!service || (!isAdvisor && !isRecipient)) fail('服务已变化或不在可督办范围', 403);
  res.json({ success: true, data: { ...task, assigneeName: service.current.find(c => c.taskId === id(task))?.person?.name || '待核对' } });
}));
router.post('/requests', wrap(async (req, res) => {
  // 顾问保留全程只读视图；随访和就医协助分别由健管、规划师督导。
  // 历史请求仍可由原接收人反馈，但不再从顾问端创建新催办。
  fail('健康顾问仅查看服务进度；请由健管专员督导随访、健康规划师督导就医协助', 409);
}));
router.post('/requests/:id/respond', wrap(async (req, res) => {
  const response = req.body?.response;
  if (typeof response !== 'string' || !response.trim() || response.trim().length > 1000) fail('请填写1至1000字的实际处理反馈', 400);
  const request = (await inbox(req.staff)).find(r => r._id === req.params.id);
  if (!request) fail('事项已处理、服务已结束或接收人已变化，请刷新');
  const saved = await Request.findOneAndUpdate({ _id: request._id, ...scope(req.staff), recipientId: req.staff._id, handledAt: null },
    { $set: { handledAt: new Date(), response: response.trim() } }, { new: true });
  if (!saved) fail('反馈已提交，请刷新');
  res.json({ success: true, data: saved });
}));
module.exports = router;
