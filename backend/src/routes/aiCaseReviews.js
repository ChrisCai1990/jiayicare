const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const staffAuth = require('../middleware/staffAuth');
const User = require('../models/User');
const AiCaseReview = require('../models/AiCaseReview');
const PhaseAssessment = require('../models/PhaseAssessment');
const ServiceRecord = require('../models/ServiceRecord');
const PlanTemplate = require('../models/PlanTemplate');
const AnnualPlan = require('../models/AnnualPlan');
const { toStructuredAssessment, assessmentToPlainText, templateAssessmentFromContent, detectClinicalReview, nextAssessmentStatus } = require('../utils/phaseAssessment');
const { createAssessment } = require('../utils/phaseAssessmentScheduler');
const { buildContext, buildStageAssessmentContext } = require('../utils/aiCaseReviewContext');
const providerAdapter = require('../utils/aiCaseReviewProvider');

const DEFAULT_SCOPES = ['basic', 'healthProfile', 'reports', 'healthRecords', 'medications', 'followups', 'plans', 'aiAnalysis'];
const VALID_SCOPES = new Set(DEFAULT_SCOPES);
const VALID_REVIEW_TYPES = new Set(['checkup', 'nutrition', 'annual', 'assessment', 'medical', 'daily', 'custom']);
const ROLE_LABEL = { superadmin: '超级管理员', familyDoctor: '健康顾问', nutritionist: '营养师', healthManager: '健管专员', healthPlanner: '健康规划师', medicalAssistant: '就医专员', psychologist: '心理咨询师', rehabSpecialist: '运动复健师', tcmDoctor: '中医师', specialist: '专科医师' };

function sanitizeScopes(scopes) {
  return [...new Set((Array.isArray(scopes) ? scopes : DEFAULT_SCOPES).filter(item => VALID_SCOPES.has(item)))];
}

async function patientOr404(req, res) {
  if (!mongoose.isValidObjectId(req.params.patientId)) { res.status(400).json({ success: false, message: '客户ID无效' }); return null; }
  const user = await User.findById(req.params.patientId);
  if (!user) { res.status(404).json({ success: false, message: '客户不存在' }); return null; }
  if (user.aiPilotFeatures?.stageAssessment !== true) {
    res.status(403).json({ success: false, message: '该客户尚未进入阶段性健康评估试点' });
    return null;
  }
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

async function archiveFinalAssessment(item, user, staff) {
  const customerVersion = templateAssessmentFromContent(item.content, item);
  return ServiceRecord.findOneAndUpdate(
    { sourcePhaseAssessmentId: item._id },
    { $set: {
      staffId: staff._id, patientId: user._id, type: 'stage_assessment', date: item.finalizedAt || new Date(),
      title: `${item.periodLabel}${item.templateSnapshot?.name || '阶段性健康评估'}`,
      content: customerVersion.sections.flatMap(section => [section.title, ...section.items.map(value => `• ${value}`)]).join('\n'),
      result: item.doctorReview?.note || item.nutritionReview?.note || '', structuredContent: customerVersion,
      aiStatus: 'approved', aiGeneratedAt: item.createdAt,
    }, $setOnInsert: { sourcePhaseAssessmentId: item._id } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

function isAssignedReviewer(user, staff, role) {
  if (staff.role === 'superadmin') return true;
  const field = role === 'nutritionist' ? 'assignedNutritionist' : role === 'familyDoctor' ? 'assignedFamilyDoctor' : '';
  return Boolean(field && user[field] && String(user[field]) === String(staff._id));
}

router.post('/patients/:patientId/phase-assessments/generate', staffAuth, async (req, res) => {
  try {
    if (!['nutritionist', 'familyDoctor', 'superadmin'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '仅营养师或健康顾问可发起阶段性评估' });
    const user = await patientOr404(req, res); if (!user) return;
    if (req.staff.role !== 'superadmin' && !isAssignedReviewer(user, req.staff, req.staff.role)) return res.status(403).json({ success: false, message: '仅该客户当前绑定的营养师或健康顾问可发起评估' });
    const plan = await AnnualPlan.findOne({ patientId: user._id, confirmedAt: { $ne: null } }).sort({ confirmedAt: -1 }).lean();
    if (!plan) return res.status(409).json({ success: false, message: '客户尚无已确认年度管理方案，暂不能生成阶段性评估' });
    const template = await PlanTemplate.findOne({ type: 'phase_assessment', status: 'active', 'content.frequency': 'monthly', $or: [{ clientBrand: user.clientBrand || '' }, { clientBrand: '' }] }).sort({ clientBrand: -1, updatedAt: -1 }).lean();
    if (!template) return res.status(409).json({ success: false, message: 'Admin尚未启用适用的月度阶段性评估模板' });
    const item = await createAssessment({ plan, user, template });
    if (!item) {
      const existing = await PhaseAssessment.findOne({ annualPlanId: plan._id, templateId: template._id }).sort({ createdAt: -1 }).lean();
      return res.status(409).json({ success: false, message: '本周期已经生成阶段性评估', data: existing });
    }
    res.status(201).json({ success: true, data: item });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/patients/:patientId/phase-assessments/:assessmentId', staffAuth, async (req, res) => {
  try {
    const user = await patientOr404(req, res); if (!user) return;
    const item = await PhaseAssessment.findOne({ _id: req.params.assessmentId, patientId: user._id });
    if (!item) return res.status(404).json({ success: false, message: '阶段性评估不存在' });
    const current = item.status === 'pending' ? 'nutrition_review' : item.status;
    const actorRole = req.staff.role === 'superadmin' ? (current === 'doctor_review' ? 'familyDoctor' : 'nutritionist') : req.staff.role;
    if (!isAssignedReviewer(user, req.staff, actorRole)) return res.status(403).json({ success: false, message: actorRole === 'nutritionist' ? '仅该客户当前绑定的营养师可初审' : '仅该客户当前绑定的健康顾问可复审' });
    if (req.body.action === 'regenerate') {
      if (actorRole !== 'nutritionist' || !['nutrition_review', 'rejected'].includes(current)) return res.status(403).json({ success: false, message: '仅营养师可对退回的阶段评估重新生成' });
      const snapshot = await buildStageAssessmentContext(user, item.templateSnapshot?.windowDays === 14 ? 14 : 30);
      const note = String(req.body.reviewNote || item.nutritionReview?.note || '').trim();
      const prompt = `请重新生成${item.periodLabel}阶段性健康评估。核心主线是“阶段数据变化→生活方式关联→潜在风险→下一步规划”。必须吸收营养师退回意见，不得诊断、开药、补造事实或把相关性写成因果。所有评估先由营养师审核，涉及临床问题再由健康顾问复审。\n\n【退回意见】${note || '请重新核对资料与结论'}\n【原草稿】${item.content}\n【最新阶段资料】${JSON.stringify(snapshot).slice(0, 45000)}\n\n严格使用四个栏目：${(item.templateSnapshot?.outputSections || []).join('；') || '阶段数据变化；生活方式关联分析；潜在风险与数据缺口；下一阶段行动规划'}。每栏最多6条，每条使用“简短判断标签：依据说明”。`;
      const result = await providerAdapter.reply({ preferred: 'qwen', sessionId: String(item._id), prompt, context: snapshot, attachments: [], history: [] });
      if (!result.content) throw new Error('AI未返回阶段评估草稿');
      item.content = result.content; item.evidenceSources = snapshot.sources || []; item.status = 'nutrition_review';
      item.nutritionReview = { status: 'pending', note, reviewedBy: req.staff._id, reviewedByName: req.staff.name || '', reviewedAt: new Date() };
      item.auditLog.push({ action: 'regenerate', fromStatus: current, toStatus: 'nutrition_review', note, staffId: req.staff._id, staffName: req.staff.name || '', staffRole: actorRole, at: new Date() });
      await item.save();
      return res.json({ success: true, data: item });
    }
    const actionMap = { approve: 'approve', reject: 'return', return: 'return', escalate: 'escalate' };
    const action = actionMap[req.body.action];
    const ruleReasons = detectClinicalReview(item.content);
    const clinicalRequired = ruleReasons.length > 0 || req.body.clinicalRequired === true || action === 'escalate';
    const nextStatus = nextAssessmentStatus({ currentStatus: current, actorRole, action, clinicalRequired });
    if (!nextStatus) return res.status(403).json({ success: false, message: current === 'nutrition_review' ? '当前仅允许营养师初审' : current === 'doctor_review' ? '当前仅允许健康顾问复审' : '当前状态不可审核' });
    const note = String(req.body.reviewNote || '').trim();
    if ((action === 'return' || action === 'escalate') && !note) return res.status(400).json({ success: false, message: '退回或升级临床复审必须填写说明' });
    const now = new Date();
    item.status = nextStatus;
    item.content = String(req.body.content || item.content).trim();
    if (actorRole === 'nutritionist') {
      item.nutritionReview = { status: nextStatus === 'doctor_review' ? 'escalated' : nextStatus === 'finalized' ? 'approved' : 'returned', note, reviewedBy: req.staff._id, reviewedByName: req.staff.name || '', reviewedAt: now };
      item.clinicalReview = { required: nextStatus === 'doctor_review', reasons: [...new Set([...ruleReasons, ...(Array.isArray(req.body.clinicalReasons) ? req.body.clinicalReasons : [])])], forcedByRule: ruleReasons.length > 0, escalatedByNutritionist: action === 'escalate' || req.body.clinicalRequired === true };
      if (nextStatus === 'doctor_review') item.doctorReview = { status: 'pending', note: '', reviewedBy: null, reviewedByName: '', reviewedAt: null };
    } else {
      item.doctorReview = { status: nextStatus === 'finalized' ? 'approved' : 'returned', note, reviewedBy: req.staff._id, reviewedByName: req.staff.name || '', reviewedAt: now };
    }
    if (nextStatus === 'finalized') { item.finalizedAt = now; item.finalizedBy = req.staff._id; item.reviewedAt = now; item.reviewedBy = req.staff._id; item.reviewNote = note; }
    item.auditLog.push({ action, fromStatus: current, toStatus: nextStatus, note, staffId: req.staff._id, staffName: req.staff.name || '', staffRole: actorRole, at: now });
    await item.save();
    let serviceRecord = null;
    if (nextStatus === 'finalized') serviceRecord = await archiveFinalAssessment(item, user, req.staff);
    res.json({ success: true, data: item, serviceRecordId: serviceRecord?._id || null });
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
      reviewType: VALID_REVIEW_TYPES.has(req.body.reviewType) ? req.body.reviewType : 'custom',
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
    if (req.body.reviewType !== undefined && VALID_REVIEW_TYPES.has(req.body.reviewType)) topic.reviewType = req.body.reviewType;
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
    const prompt = `请将以下医护团队专题研判整理为简明、可执行的阶段性健康评估。固定使用六个栏目：核心结论、已确认事实、阶段变化、重点风险、下一步行动、待补信息。每栏最多5条，每条只表达一个要点；下一步行动必须写清事项、时间或频次、责任角色（资料不足写“待确认”）。不要输出Markdown符号、横线、免责声明、生成时间或审核人；不得把AI推测写成已确认事实，不得提出与本主题无关的疫苗、营养、就医或检查建议。\n\n主题：${topic.title}\n${transcript}`;
    const result = await providerAdapter.reply({ preferred: topic.preferredProvider, sessionId: topic.providerSessionId || String(topic._id), prompt, context: { sources: [] }, attachments: [], history: [] });
    const structured = toStructuredAssessment(result.content, topic.title);
    topic.conclusion = { content: assessmentToPlainText(structured), structured, status: 'draft', generatedAt: new Date(), confirmedAt: null, confirmedBy: null, confirmedByName: '', serviceRecordId: null };
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
    const structured = toStructuredAssessment(content, topic.title);
    const shouldArchive = req.body.writeToPhaseAssessment === true
      || /阶段性.*评估/.test(`${topic.title} ${topic.description}`)
      || topic.messages.some(item => item.role === 'staff' && /写入.{0,8}阶段性健康评估|阶段性健康评估.{0,8}写入/.test(item.content));
    let serviceRecord = null;
    if (shouldArchive) {
      return res.status(409).json({ success: false, message: '阶段性健康评估必须先进入营养师初审，不能从AI辅助研判直接入档；请使用页面中的“生成阶段评估草稿”入口' });
    }
    topic.conclusion = { content: assessmentToPlainText(structured), structured, status: 'confirmed', generatedAt: topic.conclusion?.generatedAt || new Date(), confirmedAt: new Date(), confirmedBy: req.staff._id, confirmedByName: req.staff.name || '', serviceRecordId: serviceRecord?._id || topic.conclusion?.serviceRecordId || null };
    topic.status = 'concluded'; topic.lastActivityAt = new Date();
    await topic.save();
    res.json({ success: true, data: forClient(topic), archivedToPhaseAssessment: Boolean(serviceRecord), customerPushEligible: serviceRecord?.structuredContent?.customerPushEligible === true, serviceRecordId: serviceRecord?._id || null });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
