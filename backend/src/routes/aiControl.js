const router = require('express').Router();
const { randomUUID } = require('crypto');
const adminAuth = require('../middleware/adminAuth');
const { collection, ensure, store } = require('../utils/aiBudgetStore');
const { DEFAULT_POLICY, validatePolicy, periodKeys } = require('../utils/aiBudgetPolicy');

function canManageAi(admin) {
  // Shared supplier keys pay for all tenants. Tenant superadmins must not see or alter
  // another institution's usage. Legacy unassigned superadmin is the current operator.
  return admin?.role === 'platformSuper' || (admin?.role === 'superadmin' && !admin?.tenantId);
}
router.use(adminAuth, (req, res, next) => canManageAi(req.admin) ? next() : res.status(403).json({ success: false, message: '仅平台管理员可管理 AI 总预算' }));

router.get('/', async (req, res) => {
  const { day, month } = periodKeys();
  const policy = await store.policy();
  const counters = await collection('ai_budget_counters').find({ _id: { $in: [`day:${day}`, `month:${month}`, `business:ocr:${day}`, `business:other:${day}`] } }).toArray();
  const circuits = await collection('ai_circuits').find({}).toArray();
  const pausedReports = await collection('medicalreports').find({ 'parseJob.status': 'paused' }, { projection: { _id: 1, 'parseJob.message': 1, 'parseJob.pausedAt': 1 } }).sort({ 'parseJob.pausedAt': -1 }).limit(50).toArray();
  const recentChanges = await collection('ai_control_audit').find({}, { projection: { before: 0, after: 0 } }).sort({ at: -1 }).limit(10).toArray();
  res.json({ success: true, data: { policy, defaults: DEFAULT_POLICY, counters, circuits, pausedReports, recentChanges, day, month } });
});

router.get('/usage', async (req, res) => {
  const filter = {};
  if (req.query.reportId) {
    if (!/^[a-f\d]{24}$/i.test(req.query.reportId)) return res.status(400).json({ success: false, message: '报告 ID 格式无效' });
    filter.reportId = req.query.reportId;
  }
  if (req.query.business && ['ocr', 'other'].includes(req.query.business)) filter.business = req.query.business;
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const rows = await collection('ai_usage').find(filter, { projection: { scopes: 0, rate: 0, tenantId: 0, actorId: 0 } }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 30).limit(31).toArray();
  const reportCounters = filter.reportId ? await collection('ai_budget_counters').find({ _id: { $regex: `^(report:${filter.reportId}$|page:${filter.reportId}:)` } }).toArray() : [];
  res.json({ success: true, data: { rows: rows.slice(0, 30), hasMore: rows.length > 30, page, reportCounters } });
});

router.put('/policy', async (req, res) => {
  let policy;
  try { policy = validatePolicy(req.body.policy); }
  catch (error) { return res.status(400).json({ success: false, message: error.message }); }
  if (!Number.isSafeInteger(req.body.revision) || req.body.revision < 0) return res.status(400).json({ success: false, message: '配置版本无效' });
  await ensure('ai_control', 'policy', { ...DEFAULT_POLICY, revision: 0 });
  const previous = await store.policy();
  // Audit the proposed change before mutation; pending records remain distinguishable if DB fails.
  const auditId = randomUUID();
  await collection('ai_control_audit').insertOne({ _id: auditId, action: 'policy', status: 'pending', at: new Date(), actorId: String(req.admin._id), before: previous, after: policy });
  const result = await collection('ai_control').updateOne({ _id: 'policy', revision: req.body.revision }, { $set: { ...policy, updatedAt: new Date(), updatedBy: String(req.admin._id) }, $inc: { revision: 1 } });
  await collection('ai_control_audit').updateOne({ _id: auditId }, { $set: { status: result.modifiedCount ? 'applied' : 'conflict' } });
  if (!result.modifiedCount) return res.status(409).json({ success: false, message: '配置已被其他管理员更新，请刷新后重试' });
  res.json({ success: true, data: await store.policy() });
});

router.post('/circuits/reset', async (req, res) => {
  if (typeof req.body.key !== 'string' || !/^[\w-]+:[\w-]+$/.test(req.body.key)) return res.status(400).json({ success: false, message: '模型标识无效' });
  await collection('ai_control_audit').insertOne({ _id: randomUUID(), action: 'reset_circuit', target: req.body.key, at: new Date(), actorId: String(req.admin._id) });
  await collection('ai_circuits').updateOne({ _id: req.body.key }, { $set: { paused: false, failures: 0, updatedAt: new Date() } });
  res.json({ success: true });
});

router.post('/reports/:id/allowance', async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id) || !Number.isSafeInteger(req.body.tokens) || req.body.tokens < 1 || req.body.tokens > 10000000 || !Number.isSafeInteger(req.body.calls) || req.body.calls < 1 || req.body.calls > 500 || (req.body.page != null && (!Number.isInteger(req.body.page) || req.body.page < 1 || req.body.page > 10000))) return res.status(400).json({ success: false, message: '请输入有效的报告 ID、追加 Token、调用次数及页码' });
  const scope = req.body.page ? `page:${req.params.id}:${req.body.page}` : `report:${req.params.id}`;
  await ensure('ai_budget_counters', scope, { tokens: 0, calls: 0, micros: 0, extraTokens: 0, extraCalls: 0 });
  await collection('ai_control_audit').insertOne({ _id: randomUUID(), action: 'allowance', target: scope, tokens: req.body.tokens, calls: req.body.calls, at: new Date(), actorId: String(req.admin._id) });
  await collection('ai_budget_counters').updateOne({ _id: scope }, { $inc: { extraTokens: req.body.tokens, extraCalls: req.body.calls } });
  res.json({ success: true, message: '追加额度已生效；全局与业务上限仍然有效' });
});

router.post('/reports/:id/resume', async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ success: false, message: '报告 ID 格式无效' });
  const MedicalReport = require('../models/MedicalReport');
  const id = req.params.id;
  const auditId = randomUUID();
  await collection('ai_control_audit').insertOne({ _id: auditId, action: 'resume_report', target: id, status: 'pending', at: new Date(), actorId: String(req.admin._id) });
  const result = await MedicalReport.findOneAndUpdate({ _id: id, 'parseJob.status': 'paused', aiStatus: 'failed' }, { $set: { aiStatus: 'processing', 'parseJob.status': 'processing', 'parseJob.message': '管理员已恢复，等待继续识别', 'parseJob.resumedAt': new Date(), 'parseJob.resumedBy': String(req.admin._id) } });
  await collection('ai_control_audit').updateOne({ _id: auditId }, { $set: { status: result ? 'applied' : 'conflict' } });
  if (!result) return res.status(409).json({ success: false, message: '报告已不在暂停状态，请刷新' });
  require('./staff').scheduleReportParse(id);
  res.json({ success: true, message: '已恢复排队；每次模型调用仍需通过预算检查' });
});
module.exports = router;
module.exports.canManageAi = canManageAi;
