const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const staffAuth = require('../middleware/staffAuth');
const User = require('../models/User');
const AiCaseReview = require('../models/AiCaseReview');
const PhaseAssessment = require('../models/PhaseAssessment');
const PlanTemplate = require('../models/PlanTemplate');
const AnnualPlan = require('../models/AnnualPlan');
const HealthPlan = require('../models/HealthPlan');
const { toStructuredAssessment, assessmentToPlainText, detectClinicalReview, nextAssessmentStatus } = require('../utils/phaseAssessment');
const { createAssessment, intensiveNutritionCheckpoint } = require('../utils/phaseAssessmentScheduler');
const { buildContext, buildStageAssessmentContext } = require('../utils/aiCaseReviewContext');
const providerAdapter = require('../utils/aiCaseReviewProvider');
const { completePhaseAssessmentArchive } = require('../utils/phaseAssessmentArchive');
const { ROLE_FIELDS, ROLE_LABELS, DOMAIN_ROLES, primaryRole, currentReviewer, initialReviewStatus, isAssignedPhaseReviewer } = require('../utils/phaseAssessmentRouting');
const { DEFAULT_SCOPES, ensureAiCaseReviewTemplates } = require('../utils/aiCaseReviewTemplates');

const VALID_SCOPES = new Set(DEFAULT_SCOPES);
const VALID_REVIEW_TYPES = new Set(['checkup', 'nutrition', 'annual', 'assessment', 'medical', 'daily', 'specialty', 'custom']);
const ROLE_LABEL = { superadmin: '超级管理员', familyDoctor: '健康顾问', nutritionist: '营养师', healthManager: '健管专员', healthPlanner: '健康规划师', medicalAssistant: '就医专员', psychologist: '心理咨询师', rehabSpecialist: '运动复健师', tcmDoctor: '中医师', specialist: '专科医师' };

function sanitizeScopes(scopes) {
  return [...new Set((Array.isArray(scopes) ? scopes : DEFAULT_SCOPES).filter(item => VALID_SCOPES.has(item)))];
}

async function caseReviewPatientOr404(req, res) {
  if (!mongoose.isValidObjectId(req.params.patientId)) { res.status(400).json({ success: false, message: '客户ID无效' }); return null; }
  const user = await User.findById(req.params.patientId);
  if (!user) { res.status(404).json({ success: false, message: '客户不存在' }); return null; }
  return user;
}

async function patientOr404(req, res) {
  const user = await caseReviewPatientOr404(req, res);
  if (!user) return null;
  const assignedFields = [...Object.values(ROLE_FIELDS), 'assignedHealthManager', 'assignedHealthPlanner', 'assignedSpecialist', 'assignedMedicalAssistant', 'assignedPsychologist'];
  if (req.staff.role !== 'superadmin' && !assignedFields.some(field => user[field] && String(user[field]) === String(req.staff._id))) {
    res.status(403).json({ success: false, message: '无权访问该客户的阶段评估' }); return null;
  }
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

router.get('/ai-case-review/templates', staffAuth, async (req, res) => {
  try {
    await ensureAiCaseReviewTemplates();
    const [templates, settings] = await Promise.all([
      PlanTemplate.find({ type: 'ai_case_review', status: 'active', 'content.kind': { $ne: 'settings' } }).lean(),
      PlanTemplate.findOne({ type: 'ai_case_review', 'content.kind': 'settings' }).lean(),
    ]);
    templates.sort((a, b) => (a.content?.sortOrder ?? 999) - (b.content?.sortOrder ?? 999));
    res.json({ success: true, data: templates.map(item => ({
      key: String(item._id), label: item.name, title: item.content?.title || item.name,
      description: item.content?.description || '', scopes: sanitizeScopes(item.content?.contextScopes),
      target: item.content?.target || '研判结论', reviewType: VALID_REVIEW_TYPES.has(item.content?.templateKey) ? item.content.templateKey : 'specialty', outputGuide: item.content?.outputGuide || '',
    })), settings: { allowCustomTopic: settings?.content?.allowCustomTopic !== false } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/patients/:patientId/phase-assessments', staffAuth, async (req, res) => {
  try {
    const user = await patientOr404(req, res); if (!user) return;
    // 被新结构替代的试跑草稿保留审计，但不再混入当前工作界面。
    const data = await PhaseAssessment.find({ patientId: user._id, periodKey: { $not: /-legacy-/ } }).sort({ createdAt: -1 }).limit(20).lean();
    const targetId = req.query.assessmentId;
    if (targetId) {
      if (!mongoose.isValidObjectId(targetId)) return res.status(400).json({ success: false, message: '评估ID无效' });
      if (!data.some(item => String(item._id) === targetId)) {
        const target = await PhaseAssessment.findOne({ _id: targetId, patientId: user._id, periodKey: { $not: /-legacy-/ } }).lean();
        if (target) data.unshift(target);
      }
    }
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

function isAssignedReviewer(user, staff, role) {
  return isAssignedPhaseReviewer(user, staff, role);
}

router.post('/patients/:patientId/phase-assessments/generate', staffAuth, async (req, res) => {
  try {
    if (![...Object.keys(ROLE_FIELDS), 'superadmin'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '仅对应专业人员或健康顾问可发起阶段性评估' });
    const user = await patientOr404(req, res); if (!user) return;
    if (req.staff.role !== 'superadmin' && !isAssignedReviewer(user, req.staff, req.staff.role)) return res.status(403).json({ success: false, message: '仅该客户当前绑定的专业人员或健康顾问可发起评估' });
    const plan = await AnnualPlan.findOne({ patientId: user._id, confirmedAt: { $ne: null } }).sort({ confirmedAt: -1 }).lean();
    if (!plan) return res.status(409).json({ success: false, message: '客户尚无已确认年度管理方案，暂不能生成阶段性评估' });
    const assessmentMode = req.body.mode === 'intensive_nutrition' ? 'intensive_nutrition' : 'routine';
    const assessmentDomain = assessmentMode === 'intensive_nutrition' ? 'nutrition' : (req.body.domain || 'comprehensive');
    if (!DOMAIN_ROLES[assessmentDomain]) return res.status(400).json({ success: false, message: '评估领域无效' });
    if (!['superadmin', 'familyDoctor', DOMAIN_ROLES[assessmentDomain]].includes(req.staff.role)) return res.status(403).json({ success: false, message: '请由对应专业人员或健康顾问发起该领域评估' });
    const frequency = assessmentMode === 'intensive_nutrition' ? 'monthly' : 'quarterly';
    const template = await PlanTemplate.findOne({ type: 'phase_assessment', status: 'active', 'content.frequency': frequency, $and: [
      { $or: [{ clientBrand: user.clientBrand || '' }, { clientBrand: '' }] },
      { $or: [{ 'content.assessmentDomain': assessmentDomain }, { 'content.assessmentDomain': { $exists: false } }] },
    ] }).sort({ 'content.assessmentDomain': -1, clientBrand: -1, updatedAt: -1 }).lean();
    if (!template) return res.status(409).json({ success: false, message: 'Admin尚未启用适用领域的阶段性评估模板（常规季度/强化营养月度模板）' });
    let periodOverride = null; let sourceNutritionPlanId = null; let interventionWeek = null;
    if (assessmentMode === 'intensive_nutrition') {
      const nutritionPlan = await HealthPlan.findOne({ patientId: user._id, type: 'nutrition', confirmedAt: { $ne: null }, status: { $in: ['active', 'draft'] } }).sort({ confirmedAt: -1 }).lean();
      if (!nutritionPlan) return res.status(409).json({ success: false, message: '客户尚无已确认的强化营养干预方案' });
      const startedAt = new Date(nutritionPlan.startDate || nutritionPlan.confirmedAt);
      const elapsedDays = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 86400000));
      const elapsedWeek = Math.floor(elapsedDays / 7) + 1;
      interventionWeek = intensiveNutritionCheckpoint(elapsedWeek);
      if (!interventionWeek || elapsedWeek > 12) return res.status(409).json({ success: false, message: elapsedWeek > 12 ? '本轮12周强化干预已结束' : '尚未到第1周评估节点' });
      periodOverride = { key: `nutrition-${nutritionPlan._id}-W${interventionWeek}`, label: `强化营养干预第${interventionWeek}周` };
      sourceNutritionPlanId = nutritionPlan._id;
      template.content = { ...template.content, windowDays: interventionWeek <= 4 ? 7 : 14 };
    }
    const item = await createAssessment({ plan, user, template, periodOverride, assessmentMode, assessmentDomain, sourceNutritionPlanId, interventionWeek });
    if (!item) {
      const existing = await PhaseAssessment.findOne({ annualPlanId: plan._id, templateId: template._id, assessmentMode, $or: [{ assessmentDomain }, { assessmentDomain: { $exists: false } }] }).sort({ createdAt: -1 }).lean();
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
    const expectedRole = currentReviewer(item);
    const actorRole = req.staff.role === 'superadmin' ? expectedRole : req.staff.role;
    if (!expectedRole || actorRole !== expectedRole || !isAssignedReviewer(user, req.staff, expectedRole)) return res.status(403).json({ success: false, message: `当前应由该客户的${ROLE_LABELS[expectedRole] || '对应岗位'}处理` });
    if (current === 'archive_pending') {
      if (req.body.action !== 'retry_archive') return res.status(409).json({ success: false, message: '评估已审核，请重试归档；不能修改已审核内容' });
      const result = await completePhaseAssessmentArchive(item, user, req.staff);
      return res.status(result.data?.status === 'finalized' ? 200 : 202).json({ success: true, ...result });
    }
    if (req.body.revision !== item.__v) return res.status(409).json({ success: false, message: '评估已更新，请刷新后审核' });
    if (req.body.action === 'regenerate') {
      if (actorRole !== primaryRole(item) || current !== 'rejected') return res.status(403).json({ success: false, message: '仅当前初审岗位可对退回的评估重新生成' });
      const snapshot = await buildStageAssessmentContext(user, item.templateSnapshot?.windowDays || 30);
      const note = String(req.body.reviewNote || item.doctorReview?.note || item.professionalReview?.note || item.nutritionReview?.note || '').trim();
      const prompt = `请重新生成${item.periodLabel}阶段性健康评估，审核岗位为${ROLE_LABELS[primaryRole(item)]}。主线是“阶段变化→生活方式关联→风险缺口→下一步规划”。参考审核人退回意见，不得诊断、处方、辨证施治、补造事实或把相关性写成因果。健康风险交健康顾问综合复核。\n【退回意见】${note || '请核对资料与结论'}\n【原草稿】${item.content}\n【最新资料】${JSON.stringify(snapshot).slice(0, 45000)}\n使用四个栏目：${(item.templateSnapshot?.outputSections || []).join('；') || '阶段数据变化；生活方式关联分析；风险与数据缺口；下一阶段行动规划'}。每栏最多6条。`;
      const result = await providerAdapter.reply({ preferred: 'qwen', sessionId: String(item._id), prompt, context: snapshot, attachments: [], history: [] });
      if (!result.content) throw new Error('AI未返回阶段评估草稿');
      item.content = result.content; item.evidenceSources = snapshot.sources || []; item.status = initialReviewStatus(primaryRole(item));
      item[actorRole === 'nutritionist' ? 'nutritionReview' : actorRole === 'familyDoctor' ? 'doctorReview' : 'professionalReview'] = { status: 'pending', note, reviewedBy: req.staff._id, reviewedByName: req.staff.name || '', reviewedAt: new Date() };
      item.auditLog.push({ action: 'regenerate', fromStatus: current, toStatus: item.status, note, staffId: req.staff._id, staffName: req.staff.name || '', staffRole: actorRole, at: new Date() });
      await item.save();
      return res.json({ success: true, data: item });
    }
    const actionMap = { approve: 'approve', reject: 'return', return: 'return', escalate: 'escalate' };
    const action = actionMap[req.body.action];
    const reviewedContent = String(req.body.content ?? item.content).trim();
    if (!reviewedContent) return res.status(400).json({ success: false, message: '评估内容不能为空' });
    const ruleReasons = detectClinicalReview(reviewedContent);
    const clinicalRequired = ruleReasons.length > 0 || req.body.clinicalRequired === true || action === 'escalate';
    const nextStatus = nextAssessmentStatus({ currentStatus: current, actorRole, action, clinicalRequired, primaryReviewRole: primaryRole(item) });
    if (!nextStatus) return res.status(403).json({ success: false, message: '当前岗位或状态不允许该审核操作' });
    const note = String(req.body.reviewNote || '').trim();
    if ((action === 'return' || action === 'escalate') && !note) return res.status(400).json({ success: false, message: '退回或转健康顾问综合复核必须填写说明' });
    const now = new Date();
    item.status = nextStatus;
    item.content = reviewedContent;
    if (actorRole !== 'familyDoctor') {
      item[actorRole === 'nutritionist' ? 'nutritionReview' : 'professionalReview'] = { status: nextStatus === 'doctor_review' ? 'escalated' : nextStatus === 'finalized' ? 'approved' : 'returned', note, reviewedBy: req.staff._id, reviewedByName: req.staff.name || '', reviewedAt: now };
      item.clinicalReview = { required: nextStatus === 'doctor_review', reasons: [...new Set([...ruleReasons, ...(Array.isArray(req.body.clinicalReasons) ? req.body.clinicalReasons : [])])], forcedByRule: ruleReasons.length > 0, escalatedByNutritionist: action === 'escalate' || req.body.clinicalRequired === true };
      if (nextStatus === 'doctor_review') item.doctorReview = { status: 'pending', note: '', reviewedBy: null, reviewedByName: '', reviewedAt: null };
    } else {
      item.doctorReview = { status: nextStatus === 'finalized' ? 'approved' : 'returned', note, reviewedBy: req.staff._id, reviewedByName: req.staff.name || '', reviewedAt: now };
    }
    if (nextStatus === 'finalized') {
      item.status = 'archive_pending'; item.finalizedAt = now; item.finalizedBy = req.staff._id;
      item.finalReviewRole = expectedRole; item.finalizedByName = req.staff.name || ''; item.finalizedByRole = req.staff.role;
      item.reviewedAt = now; item.reviewedBy = req.staff._id; item.reviewNote = note;
    }
    item.auditLog.push({ action, fromStatus: current, toStatus: item.status, note, staffId: req.staff._id, staffName: req.staff.name || '', staffRole: actorRole, at: now });
    await item.save();
    if (nextStatus === 'finalized') {
      const result = await completePhaseAssessmentArchive(item, user, req.staff);
      return res.status(result.data?.status === 'finalized' ? 200 : 202).json({ success: true, ...result });
    }
    res.json({ success: true, data: item, serviceRecordId: null });
  } catch (err) { res.status(err.name === 'VersionError' ? 409 : 500).json({ success: false, message: err.name === 'VersionError' ? '评估已更新，请刷新后审核' : err.message }); }
});

router.get('/patients/:patientId/ai-case-reviews', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    const topics = await AiCaseReview.find({ user: user._id, status: { $ne: 'archived' } }).sort({ lastActivityAt: -1 });
    res.json({ success: true, data: topics.map(forClient) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/patients/:patientId/ai-case-reviews', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    await ensureAiCaseReviewTemplates();
    const settings = await PlanTemplate.findOne({ type: 'ai_case_review', 'content.kind': 'settings' }).lean();
    const selectedTemplate = mongoose.isValidObjectId(req.body.templateId)
      ? await PlanTemplate.findOne({ _id: req.body.templateId, type: 'ai_case_review', status: 'active', 'content.kind': { $ne: 'settings' } }).lean()
      : null;
    if (!selectedTemplate && settings?.content?.allowCustomTopic === false) return res.status(400).json({ success: false, message: '请选择专项研判主题' });
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ success: false, message: '请输入研判主题' });
    const topic = await AiCaseReview.create({
      user: user._id, tenantId: user.tenantId || null, title,
      description: String(req.body.description || '').trim(),
      reviewType: VALID_REVIEW_TYPES.has(req.body.reviewType) ? req.body.reviewType : 'custom',
      templateId: selectedTemplate?._id || null,
      templateSnapshot: selectedTemplate ? { name: selectedTemplate.name, target: selectedTemplate.content?.target || '研判结论', outputGuide: selectedTemplate.content?.outputGuide || '' } : null,
      contextScopes: sanitizeScopes(req.body.contextScopes),
      preferredProvider: 'qwen',
      createdBy: req.staff._id, createdByName: req.staff.name || '',
    });
    res.status(201).json({ success: true, data: forClient(topic) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/patients/:patientId/ai-case-reviews/:topicId', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
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

router.delete('/patients/:patientId/ai-case-reviews/:topicId', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id });
    if (!topic) return res.status(404).json({ success: false, message: '研判主题不存在' });
    topic.status = 'archived';
    topic.lastActivityAt = new Date();
    await topic.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/patients/:patientId/ai-case-reviews/:topicId/messages', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id });
    if (!topic) return res.status(404).json({ success: false, message: '研判主题不存在' });
    const content = String(req.body.content || '').trim();
    const attachments = (Array.isArray(req.body.attachments) ? req.body.attachments : []).slice(0, 6);
    if (!content && !attachments.length) return res.status(400).json({ success: false, message: '请输入问题或添加图片' });
    topic.messages.push({ role: 'staff', content: content || '请分析本轮上传的图文资料', staff: req.staff._id, staffName: req.staff.name || '', staffRole: ROLE_LABEL[req.staff.role] || req.staff.role, attachments });
    await topic.save();

    const snapshot = await buildContext(user, topic.contextScopes);
    const isSupplement = topic.messages.length > 1;
    const history = topic.messages.slice(isSupplement ? -7 : -13, -1).map(item => ({ role: item.role === 'ai' ? 'assistant' : 'user', content: item.content }));
    const topicGuide = [topic.title, topic.description, topic.templateSnapshot?.outputGuide ? `固定研判输出：${topic.templateSnapshot.outputGuide}` : ''].filter(Boolean).join('\n');
    const incrementalGuide = isSupplement
      ? '这是一次补充讨论。只回答本轮新增信息，严禁重述既往完整病史、检查清单、管理方案或原分析。输出最多3个短段：1.新增信息解读；2.修订说明（没有则写“无修订”）；3.对阶段性结论的影响。全文控制在300个中文字以内，每段最多3点。最新更正信息优先于旧信息。'
      : '这是本主题首次讨论，请围绕本轮问题形成初步分析，并标明待确认信息。';
    const result = await providerAdapter.reply({ preferred: topic.preferredProvider, sessionId: topic.providerSessionId || String(topic._id), prompt: `【专项研判主题与要求】\n${topicGuide}\n\n【分析方式】\n${incrementalGuide}\n\n【本轮新增信息】\n${content || '请分析本轮上传的图文资料'}`, context: snapshot, attachments, history, maxTokens: isSupplement ? 500 : 1800 });
    if (!result.content) throw new Error(`${result.provider} 未返回可展示的分析内容`);
    topic.providerSessionId = result.sessionId || topic.providerSessionId;
    topic.messages.push({ role: 'ai', content: result.content, provider: result.provider, providerModel: result.model, durationMs: result.durationMs, attachments: result.files, evidenceRefs: snapshot.sources, contextSnapshot: snapshot });
    topic.lastActivityAt = new Date();
    await topic.save();
    res.json({ success: true, data: forClient(topic), provider: result.provider });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/patients/:patientId/ai-case-reviews/:topicId/messages/:messageId', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id });
    if (!topic) return res.status(404).json({ success: false, message: '研判主题不存在' });
    const message = topic.messages.id(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: '讨论记录不存在' });
    const content = String(req.body.content || '').trim();
    if (!content) return res.status(400).json({ success: false, message: '讨论内容不能为空' });
    message.content = content;
    const messageIndex = topic.messages.findIndex(item => String(item._id) === req.params.messageId);
    if (message.role === 'staff' && topic.messages[messageIndex + 1]?.role === 'ai') topic.messages.splice(messageIndex + 1, 1);
    topic.conclusion = { content: '', structured: null, status: 'draft' };
    topic.status = 'active'; topic.lastActivityAt = new Date();
    await topic.save();
    res.json({ success: true, data: forClient(topic) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/patients/:patientId/ai-case-reviews/:topicId/messages/:messageId', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id });
    if (!topic) return res.status(404).json({ success: false, message: '研判主题不存在' });
    const index = topic.messages.findIndex(item => String(item._id) === req.params.messageId);
    if (index < 0) return res.status(404).json({ success: false, message: '讨论记录不存在' });
    const deleteCount = topic.messages[index].role === 'staff' && topic.messages[index + 1]?.role === 'ai' ? 2 : 1;
    topic.messages.splice(index, deleteCount);
    topic.conclusion = { content: '', structured: null, status: 'draft' };
    topic.status = 'active'; topic.lastActivityAt = new Date();
    await topic.save();
    res.json({ success: true, data: forClient(topic) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/patients/:patientId/ai-case-reviews/:topicId/conclusion', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id });
    if (!topic) return res.status(404).json({ success: false, message: '研判主题不存在' });
    if (!topic.messages.length) return res.status(400).json({ success: false, message: '暂无讨论内容' });
    const transcript = topic.messages.map(item => `${item.role === 'ai' ? 'AI' : `${item.staffName}（${item.staffRole}）`}：${item.content}`).join('\n');
    const prompt = `请将以下医护团队专题研判整理为简明、可执行的阶段性结论。固定使用六个栏目：核心结论、已确认事实、阶段变化、重点风险、下一步行动、待补信息。以时间较新的更正和补充为准，排除已被修订的信息，只把当前正确、有效的信息写入结论；若存在实质修订，在“阶段变化”中说明修订了什么。每栏最多5条，每条只表达一个要点；下一步行动必须写清事项、时间或频次、责任角色（资料不足写“待确认”）。不要输出Markdown符号、横线、免责声明、生成时间或审核人；不得把AI推测写成已确认事实，不得提出与本主题无关的疫苗、营养、就医或检查建议。${topic.templateSnapshot?.outputGuide ? `本主题重点输出范围：${topic.templateSnapshot.outputGuide}。` : ''}\n\n主题：${topic.title}\n${transcript}`;
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
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
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
