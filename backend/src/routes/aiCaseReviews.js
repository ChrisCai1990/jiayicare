const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const staffAuth = require('../middleware/staffAuth');
const User = require('../models/User');
const AiCaseReview = require('../models/AiCaseReview');
const PhaseAssessment = require('../models/PhaseAssessment');
const { buildContext } = require('../utils/aiCaseReviewContext');
const providerAdapter = require('../utils/aiCaseReviewProvider');

const DEFAULT_SCOPES = ['basic', 'healthProfile', 'reports', 'healthRecords', 'medications', 'followups', 'plans', 'aiAnalysis'];
const VALID_SCOPES = new Set(DEFAULT_SCOPES);
const ROLE_LABEL = { superadmin: '超级管理员', familyDoctor: '健康顾问', nutritionist: '营养师', healthManager: '健管专员', healthPlanner: '健康规划师', medicalAssistant: '就医专员', psychologist: '心理咨询师', rehabSpecialist: '运动复健师', tcmDoctor: '中医师', specialist: '专科医师' };

function sanitizeScopes(scopes) {
  return [...new Set((Array.isArray(scopes) ? scopes : DEFAULT_SCOPES).filter(item => VALID_SCOPES.has(item)))];
}

async function patientOr404(req, res) {
  if (!mongoose.isValidObjectId(req.params.patientId)) { res.status(400).json({ success: false, message: '客户ID无效' }); return null; }
  const user = await User.findById(req.params.patientId);
  if (!user) { res.status(404).json({ success: false, message: '客户不存在' }); return null; }
  return user;
}

function forClient(doc) {
  const data = doc.toObject ? doc.toObject() : doc;
  data.messages = (data.messages || []).map(message => ({
    ...message,
    contextSnapshot: message.contextSnapshot ? {
      capturedAt: message.contextSnapshot.capturedAt,
      sources: message.contextSnapshot.sources || [],
    } : null,
  }));
  return data;
}

router.get('/ai-case-review/providers', staffAuth, (req, res) => {
  res.json({ success: true, data: providerAdapter.availableProviders() });
});

router.get('/patients/:patientId/phase-assessments', staffAuth, async (req, res) => {
  try {
    const user = await patientOr404(req, res); if (!user) return;
    const data = await PhaseAssessment.find({ patientId: user._id }).sort({ createdAt: -1 }).limit(20).lean();
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/patients/:patientId/phase-assessments/:assessmentId', staffAuth, async (req, res) => {
  try {
    if (!['familyDoctor', 'superadmin'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '仅健康顾问可审核阶段性评估' });
    const user = await patientOr404(req, res); if (!user) return;
    const status = req.body.action === 'approve' ? 'approved' : req.body.action === 'reject' ? 'rejected' : '';
    if (!status) return res.status(400).json({ success: false, message: '审核动作无效' });
    const item = await PhaseAssessment.findOne({ _id: req.params.assessmentId, patientId: user._id, status: 'pending' });
    if (!item) return res.status(404).json({ success: false, message: '待审核阶段性评估不存在' });
    item.status = status; item.reviewedBy = req.staff._id; item.reviewedAt = new Date(); item.reviewNote = String(req.body.reviewNote || '').trim();
    await item.save();
    res.json({ success: true, data: item });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/patients/:patientId/ai-case-reviews', staffAuth, async (req, res) => {
  try {
    const user = await patientOr404(req, res); if (!user) return;
    const topics = await AiCaseReview.find({ user: user._id, status: { $ne: 'archived' } }).sort({ lastActivityAt: -1 });
    res.json({ success: true, data: topics.map(forClient) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/patients/:patientId/ai-case-reviews', staffAuth, async (req, res) => {
  try {
    const user = await patientOr404(req, res); if (!user) return;
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ success: false, message: '请输入研判主题' });
    const topic = await AiCaseReview.create({
      user: user._id, tenantId: user.tenantId || null, title,
      description: String(req.body.description || '').trim(),
      contextScopes: sanitizeScopes(req.body.contextScopes),
      preferredProvider: 'qwen',
      createdBy: req.staff._id, createdByName: req.staff.name || '',
    });
    res.status(201).json({ success: true, data: forClient(topic) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/patients/:patientId/ai-case-reviews/:topicId', staffAuth, async (req, res) => {
  try {
    const user = await patientOr404(req, res); if (!user) return;
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id });
    if (!topic) return res.status(404).json({ success: false, message: '研判主题不存在' });
    if (req.body.title !== undefined) topic.title = String(req.body.title).trim();
    if (req.body.description !== undefined) topic.description = String(req.body.description).trim();
    if (req.body.contextScopes !== undefined) topic.contextScopes = sanitizeScopes(req.body.contextScopes);
    // 测试阶段固定走通义千问，防止旧客户端或历史专题切回其他供应商。
    topic.preferredProvider = 'qwen';
    if (req.body.status !== undefined) topic.status = req.body.status;
    topic.lastActivityAt = new Date();
    await topic.save();
    res.json({ success: true, data: forClient(topic) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/patients/:patientId/ai-case-reviews/:topicId/messages', staffAuth, async (req, res) => {
  try {
    const user = await patientOr404(req, res); if (!user) return;
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id });
    if (!topic) return res.status(404).json({ success: false, message: '研判主题不存在' });
    const content = String(req.body.content || '').trim();
    const attachments = (Array.isArray(req.body.attachments) ? req.body.attachments : []).slice(0, 6);
    if (!content && !attachments.length) return res.status(400).json({ success: false, message: '请输入问题或添加图片' });
    topic.messages.push({ role: 'staff', content: content || '请分析本轮上传的图文资料', staff: req.staff._id, staffName: req.staff.name || '', staffRole: ROLE_LABEL[req.staff.role] || req.staff.role, attachments });
    await topic.save();

    const snapshot = await buildContext(user, topic.contextScopes);
    const history = topic.messages.slice(-13, -1).map(item => ({ role: item.role === 'ai' ? 'assistant' : 'user', content: item.content }));
    const result = await providerAdapter.reply({ preferred: topic.preferredProvider, sessionId: topic.providerSessionId || String(topic._id), prompt: content || '请分析本轮上传的图文资料', context: snapshot, attachments, history });
    if (!result.content) throw new Error(`${result.provider} 未返回可展示的分析内容`);
    topic.providerSessionId = result.sessionId || topic.providerSessionId;
    topic.messages.push({ role: 'ai', content: result.content, provider: result.provider, providerModel: result.model, durationMs: result.durationMs, attachments: result.files, evidenceRefs: snapshot.sources, contextSnapshot: snapshot });
    topic.lastActivityAt = new Date();
    await topic.save();
    res.json({ success: true, data: forClient(topic), provider: result.provider });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/patients/:patientId/ai-case-reviews/:topicId/conclusion', staffAuth, async (req, res) => {
  try {
    const user = await patientOr404(req, res); if (!user) return;
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id });
    if (!topic) return res.status(404).json({ success: false, message: '研判主题不存在' });
    if (!topic.messages.length) return res.status(400).json({ success: false, message: '暂无讨论内容' });
    const transcript = topic.messages.map(item => `${item.role === 'ai' ? 'AI' : `${item.staffName}（${item.staffRole}）`}：${item.content}`).join('\n');
    const prompt = `请将以下医护团队专题研判整理为阶段性结论。必须分为：一、已确认事实；二、分析判断（注明不确定性）；三、缺失信息；四、建议行动；五、风险提醒。不得把AI推测写成已确认事实。\n\n主题：${topic.title}\n${transcript}`;
    const result = await providerAdapter.reply({ preferred: topic.preferredProvider, sessionId: topic.providerSessionId || String(topic._id), prompt, context: { sources: [] }, attachments: [], history: [] });
    topic.conclusion = { content: result.content, status: 'draft', generatedAt: new Date(), confirmedAt: null, confirmedBy: null, confirmedByName: '' };
    topic.lastActivityAt = new Date();
    await topic.save();
    res.json({ success: true, data: forClient(topic) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/patients/:patientId/ai-case-reviews/:topicId/conclusion', staffAuth, async (req, res) => {
  try {
    if (!['familyDoctor', 'superadmin'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '仅健康顾问可确认研判结论' });
    const user = await patientOr404(req, res); if (!user) return;
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id });
    if (!topic) return res.status(404).json({ success: false, message: '研判主题不存在' });
    const content = String(req.body.content || topic.conclusion?.content || '').trim();
    if (!content) return res.status(400).json({ success: false, message: '结论不能为空' });
    topic.conclusion = { content, status: 'confirmed', generatedAt: topic.conclusion?.generatedAt || new Date(), confirmedAt: new Date(), confirmedBy: req.staff._id, confirmedByName: req.staff.name || '' };
    topic.status = 'concluded'; topic.lastActivityAt = new Date();
    await topic.save();
    res.json({ success: true, data: forClient(topic) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
