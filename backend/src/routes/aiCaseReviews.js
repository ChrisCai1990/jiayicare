const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const staffAuth = require('../middleware/staffAuth');
const User = require('../models/User');
const MedicalReport = require('../models/MedicalReport');
const AiCaseReview = require('../models/AiCaseReview');
const PhaseAssessment = require('../models/PhaseAssessment');
const PlanTemplate = require('../models/PlanTemplate');
const AnnualPlan = require('../models/AnnualPlan');
const HealthPlan = require('../models/HealthPlan');
const { toStructuredAssessment, assessmentToPlainText, detectClinicalReview, nextAssessmentStatus } = require('../utils/phaseAssessment');
const { createAssessment, intensiveNutritionCheckpoint, periodFor } = require('../utils/phaseAssessmentScheduler');
const { buildContext, buildStageAssessmentContext } = require('../utils/aiCaseReviewContext');
const providerAdapter = require('../utils/aiCaseReviewProvider');
const { acceptSend, finishSend } = require('../utils/aiCaseReviewSend');
const { completePhaseAssessmentArchive } = require('../utils/phaseAssessmentArchive');
const { ROLE_FIELDS, ROLE_LABELS, DOMAIN_ROLES, primaryRole, currentReviewer, initialReviewStatus, isAssignedPhaseReviewer } = require('../utils/phaseAssessmentRouting');
const { DEFAULT_SCOPES, ensureAiCaseReviewTemplates } = require('../utils/aiCaseReviewTemplates');

const VALID_SCOPES = new Set(DEFAULT_SCOPES);
const VALID_REVIEW_TYPES = new Set(['checkup', 'nutrition', 'annual', 'assessment', 'medical', 'daily', 'specialty', 'custom']);
const ROLE_LABEL = { superadmin: '超级管理员', familyDoctor: '健康顾问', nutritionist: '营养师', healthManager: '健管专员', healthPlanner: '健康规划师', medicalAssistant: '就医专员', psychologist: '心理咨询师', rehabSpecialist: '运动复健师', tcmDoctor: '中医师', specialist: '专科医师' };
const AUTO_REVIEW_MESSAGE = '【系统自动启动研判】优先核对最近一次已审核体检报告（如有），结合健康顾问纳入的问题和已审核的5年健康趋势、风险提示，提出待研判问题、专科或营养师评估去向、待核实目标及初步分析。';
const PHYSICAL_EXAM_FILTER = { $or: [
  { documentCategory: 'physical_exam' },
  { documentCategory: null, type: { $in: ['annual', 'general_exam'] } },
] };
const latestExam = patientId => MedicalReport.findOne({ user: patientId, audit_status: 'audited', ...PHYSICAL_EXAM_FILTER })
  .sort({ checkDate: -1, createdAt: -1 }).select('title type documentCategory reportYear checkDate institution examConclusion reportItems aiSummary').lean();

async function annualSpecialtySummary(patientId, year) {
  const end = new Date(`${Number(year) + 1}-01-01T00:00:00+08:00`);
  const rows = await AiCaseReview.find({ user: patientId, reviewType: 'specialty', issueKey: { $ne: '' }, status: { $ne: 'archived' }, createdAt: { $lt: end } })
    .sort({ lastActivityAt: -1 }).limit(20).select('title sourceLinks conclusion.content conclusion.status conclusion.confirmedAt').lean();
  return rows.map(row => ({ issue: row.title,
    sources: (row.sourceLinks || []).slice(0, 4).map(link => `${link.source?.checkDate || link.source?.year || '日期待核实'}：${link.title}`),
    status: row.conclusion?.status === 'confirmed' ? '健康顾问已确认' : '尚未确认，不能作为确定结论',
    conclusion: row.conclusion?.status === 'confirmed' ? String(row.conclusion.content || '').slice(0, 900) : '',
  }));
}

function sanitizeScopes(scopes) {
  return [...new Set((Array.isArray(scopes) ? scopes : DEFAULT_SCOPES).filter(item => VALID_SCOPES.has(item)))];
}

function invalidateCustomerDiscussion(topic) {
  if (topic.customerDiscussion?.status && topic.customerDiscussion.status !== 'pending') {
    topic.customerDiscussionHistory.push(topic.customerDiscussion);
  }
  topic.customerDiscussion = { status: 'pending' };
  topic.markModified?.('customerDiscussion');
}

const CONCERN_SECTIONS = new Set(['medical_priority', 'tumor_risk', 'cardiovascular_risk', 'chronic_disease', 'checkup_completeness']);
function approvedDoctorRecord(user, year) {
  const root = user.aiHealthSummary || {};
  const entry = root.byYear?.[String(year)] || (!root.byYear && root.sections ? root : null);
  const records = Array.isArray(entry?.records) ? entry.records : entry?.sections ? [entry] : [];
  const latest = records.find(row => row.scope === 'doctor' || row.scope === 'all' || !row.scope);
  return latest && (latest.doctorApprovedAt || latest.approvedAt) ? latest : null;
}

async function concernSource(user, input) {
  if (input.kind === 'screening_report') {
    if (!mongoose.isValidObjectId(input.reportId)) throw Object.assign(new Error('报告来源无效'), { status: 400 });
    const report = await MedicalReport.findOne({ _id: input.reportId, user: user._id, audit_status: 'audited' }).lean();
    if (!report) throw Object.assign(new Error('请先完成该报告审核，再发起专病研判'), { status: 409 });
    return { key: `screening_report:${report._id}`, kind: 'screening', title: report.title || '专项筛查报告',
      evidence: [report.note, report.examConclusion, ...(report.reportItems || []).filter(row => row.status === 'abnormal' || row.status === 'attention').slice(0, 8).map(row => `${row.name}：${row.conclusion || row.diagnosis || row.value || ''}`)].filter(Boolean).join('；').slice(0, 800),
      source: { reportId: String(report._id), reportTitle: report.title, checkDate: report.checkDate || '' } };
  }
  if (input.kind === 'ai_risk') {
    const year = Number(input.year);
    const root = user.aiRiskAssessment || {};
    const record = root.byYear?.[String(year)] || (!root.byYear && root.dimensions ? root : null);
    if (!Number.isInteger(year) || !record?.approvedAt) throw Object.assign(new Error('请先审核该年度AI风险提示，再纳入关注'), { status: 409 });
    const dimension = (record.dimensions || []).find(row => row.key === input.dimensionKey);
    if (!dimension) throw Object.assign(new Error('风险提示已变化，请刷新后重试'), { status: 409 });
    return { key: `ai_risk:${year}:${dimension.key}`, kind: 'ai_risk_scan', title: String(dimension.label || dimension.key),
      evidence: [dimension.level, ...(dimension.factors || []), dimension.advice].filter(Boolean).join('；').slice(0, 600),
      source: { year, dimensionKey: dimension.key, approvedAt: record.approvedAt } };
  }
  if (input.kind === 'screening') {
    if (!mongoose.isValidObjectId(input.reportId)) throw Object.assign(new Error('报告来源无效'), { status: 400 });
    const report = await MedicalReport.findOne({ _id: input.reportId, user: user._id, audit_status: 'audited' }).lean();
    if (!report) throw Object.assign(new Error('请先完成该报告审核，再纳入关注'), { status: 409 });
    const item = (report.reportItems || []).find(row => String(row.itemId || '') === String(input.itemId || '') || (!input.itemId && row.name === input.itemName));
    if (!item) throw Object.assign(new Error('报告项目已变化，请刷新后重试'), { status: 409 });
    const title = String(item.name || '').trim();
    return { key: `screening:${report._id}:${item.itemId || title}`, kind: 'screening', title,
      evidence: [item.value, item.unit, item.conclusion || item.diagnosis || item.findings].filter(Boolean).join(' · ').slice(0, 600),
      source: { reportId: String(report._id), itemId: item.itemId || '', reportTitle: report.title, checkDate: report.checkDate || '' } };
  }
  if (input.kind === 'ai_health') {
    const year = Number(input.year);
    if (!Number.isInteger(year) || !CONCERN_SECTIONS.has(input.sectionKey)) throw Object.assign(new Error('健康趋势来源无效'), { status: 400 });
    const record = approvedDoctorRecord(user, year);
    if (!record) throw Object.assign(new Error('请先审核该年度健康信息整理，再纳入关注'), { status: 409 });
    if (record.sectionReviews?.[input.sectionKey] && record.sectionReviews[input.sectionKey].status !== 'approved')
      throw Object.assign(new Error('请先审核该板块，再纳入关注'), { status: 409 });
    const section = record.sections?.[input.sectionKey] || {};
    const rows = section.items || section.topics || section.cancers || [];
    const row = rows.find(item => item.name === input.itemName);
    if (!row) throw Object.assign(new Error('健康信息整理项目已变化，请刷新后重试'), { status: 409 });
    const title = String(row.name || '').trim();
    return { key: `ai_health:${year}:${input.sectionKey}:${title}`, kind: input.sectionKey === 'medical_priority' ? 'ai_risk_scan' : 'ai_health_trend', title,
      evidence: [row.latest || row.current, row.trend, ...(row.keyChanges || []), row.meaning || row.riskBasis].filter(Boolean).join('；').slice(0, 600),
      source: { year, sectionKey: input.sectionKey, approvedAt: record.doctorApprovedAt || record.approvedAt,
        reportIds: [...new Set([row.sourceReportId, ...(section.sourceReportIds || [])].filter(Boolean).map(String))] } };
  }
  throw Object.assign(new Error('关注来源类型无效'), { status: 400 });
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
  const rights = await require('../utils/packageFeatureEntitlements').getAiEntitlements(
    user, await require('../utils/serviceAccess').resolveServiceAccess(user)
  );
  if (!rights.phaseAssessment) {
    res.status(403).json({ success: false, message: '该客户服务包未配置“阶段性评估”权益' });
    return null;
  }
  return user;
}

function forClient(doc) {
  const data = doc.toObject ? doc.toObject() : doc;
  if (data.generation) delete data.generation.token;
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
    res.json({ success: true, data, healthManagementEnabled: require('../utils/healthManagementRollout').enabledForPatient(user._id) });
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
    const closedLoop = require('../utils/healthManagementRollout').enabledForPatient(user._id);
    if (!closedLoop && !['nutritionist', 'familyDoctor', 'superadmin'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '仅营养师或健康顾问可发起阶段性评估' });
    const plan = await AnnualPlan.findOne({ patientId: user._id, confirmedAt: { $ne: null } }).sort({ confirmedAt: -1 }).lean();
    if (!plan) return res.status(409).json({ success: false, message: '客户尚无已确认年度管理方案，暂不能生成阶段性评估' });
    const assessmentMode = req.body.mode === 'intensive_nutrition' ? 'intensive_nutrition' : 'routine';
    const isAnnualReview = closedLoop && assessmentMode === 'routine' && req.body.frequency === 'yearly';
    const assessmentDomain = !closedLoop || assessmentMode === 'intensive_nutrition' ? 'nutrition' : isAnnualReview ? 'comprehensive' : (req.body.domain || 'comprehensive');
    if (!DOMAIN_ROLES[assessmentDomain]) return res.status(400).json({ success: false, message: '评估领域无效' });
    if (!['superadmin', 'familyDoctor', DOMAIN_ROLES[assessmentDomain]].includes(req.staff.role)) return res.status(403).json({ success: false, message: '请由对应专业人员或健康顾问发起该领域评估' });
    if (isAnnualReview && !['familyDoctor', 'superadmin'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '年度总评由健康顾问负责' });
    // 手动新周期与自动扫描使用同一可信服务期；审核/归档旧记录不加此门槛。
    const gate = closedLoop ? await require('../utils/annualPeriodicGate').annualPeriodicGate(plan, user) : { allowed: true, anchor: plan.confirmedAt };
    if (!gate.allowed) return res.status(409).json({ success: false, message: gate.reason || '当前年度服务期未生效，不能启动新评估' });
    const packageRights = await require('../utils/packageFeatureEntitlements').getAiEntitlements(
      user, await require('../utils/serviceAccess').resolveServiceAccess(user)
    );
    const configuredFrequency = ['biweekly', 'monthly', 'quarterly'].includes(packageRights.phaseAssessmentFrequency)
      ? packageRights.phaseAssessmentFrequency : 'quarterly';
    const frequency = !closedLoop || assessmentMode === 'intensive_nutrition' ? 'monthly' : isAnnualReview ? 'yearly' : configuredFrequency;
    if (isAnnualReview && !periodFor('yearly', new Date(), gate.anchor)) return res.status(409).json({ success: false, message: '尚未进入本年度有效执行起点后的第11个月' });
    const templateFrequencies = frequency === 'biweekly' ? ['biweekly', 'monthly', 'quarterly'] : [frequency];
    const template = await PlanTemplate.findOne({ type: 'phase_assessment', status: 'active', 'content.frequency': { $in: templateFrequencies }, $and: [
      { $or: [{ clientBrand: user.clientBrand || '' }, { clientBrand: '' }] },
      { $or: [{ 'content.assessmentDomain': assessmentDomain }, { 'content.assessmentDomain': { $exists: false } }] },
    ] }).sort({ 'content.assessmentDomain': -1, clientBrand: -1, updatedAt: -1 }).lean();
    if (!template) return res.status(409).json({ success: false, message: 'Admin尚未启用本次适用的评估模板（季度/年度总评/强化营养）' });
    let periodOverride = null; let sourceNutritionPlanId = null; let interventionWeek = null;
    if (assessmentMode === 'intensive_nutrition') {
      const nutritionPlan = await HealthPlan.findOne({ patientId: user._id, type: 'nutrition', confirmedAt: { $ne: null }, status: { $in: ['active', 'draft'] } }).sort({ confirmedAt: -1 }).lean();
      if (!nutritionPlan) return res.status(409).json({ success: false, message: '客户尚无已确认的强化营养干预方案' });
      const startedAt = new Date(nutritionPlan.startDate || nutritionPlan.confirmedAt);
      if (!Number.isFinite(startedAt.getTime()) || startedAt.getTime() > Date.now()) return res.status(409).json({ success: false, message: '强化营养干预尚未开始或开始日期无效' });
      if (nutritionPlan.endDate && require('../utils/serviceAccess').dayOf(nutritionPlan.endDate) < require('../utils/serviceAccess').chinaDay(new Date())) return res.status(409).json({ success: false, message: '本轮强化营养干预已结束' });
      const elapsedDays = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 86400000));
      const elapsedWeek = Math.floor(elapsedDays / 7) + 1;
      interventionWeek = intensiveNutritionCheckpoint(elapsedWeek);
      if (!interventionWeek || elapsedWeek > 12) return res.status(409).json({ success: false, message: elapsedWeek > 12 ? '本轮12周强化干预已结束' : '尚未到第1周评估节点' });
      periodOverride = { key: `nutrition-${nutritionPlan._id}-W${interventionWeek}`, label: `强化营养干预第${interventionWeek}周` };
      sourceNutritionPlanId = nutritionPlan._id;
      template.content = { ...template.content, windowDays: interventionWeek <= 4 ? 7 : 14 };
    }
    const item = await createAssessment({ plan, user, template, periodOverride, assessmentMode, assessmentDomain, sourceNutritionPlanId, interventionWeek, assessmentAnchor: gate.anchor, frequencyOverride: assessmentMode === 'routine' && !isAnnualReview && closedLoop ? configuredFrequency : '' });
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

router.post('/patients/:patientId/ai-case-reviews/specialty-from-source', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    if (!['familyDoctor', 'superadmin'].includes(req.staff.role) || (req.staff.role !== 'superadmin' && String(user.assignedFamilyDoctor) !== String(req.staff._id)))
      return res.status(403).json({ success: false, message: '仅该客户健康顾问可纳入专病研判' });
    const issueTitle = String(req.body.issueTitle || '').trim();
    if (issueTitle.length < 2 || issueTitle.length > 60) return res.status(400).json({ success: false, message: '请填写2至60字的具体健康问题，例如肺结节' });
    const issueKey = issueTitle.toLocaleLowerCase().replace(/[\s，。；：、]+/g, '');
    const source = await concernSource(user, req.body || {});
    const existing = await AiCaseReview.findOne({ user: user._id, reviewType: 'specialty', issueKey, status: { $ne: 'archived' } });
    if (existing) {
      if (!existing.sourceLinks.some(row => row.key === source.key)) {
        if (existing.generation?.status === 'running') return res.status(409).json({ success: false, message: '该专病正在AI分析，请稍后再补充来源' });
        existing.sourceLinks.push({ ...source, linkedAt: new Date(), linkedByName: req.staff.name || '' });
        reopenAfterConcernChange(existing);
        existing.status = 'active';
        await existing.save();
      }
      return res.json({ success: true, data: forClient(existing), reused: true });
    }
    const topic = await AiCaseReview.create({ user: user._id, tenantId: user.tenantId || null,
      title: `${issueTitle}专项研判`, description: `围绕“${issueTitle}”核对已审核资料和历年变化，判断是否需要专科评估或就医、营养师评估及随访复评。`,
      reviewType: 'specialty', issueKey, sourceLinks: [{ ...source, linkedAt: new Date(), linkedByName: req.staff.name || '' }],
      contextScopes: ['basic', 'healthProfile', 'reports', 'healthRecords', 'medications', 'followups', 'plans', 'aiAnalysis'],
      preferredProvider: 'qwen', createdBy: req.staff._id, createdByName: req.staff.name || '' });
    return res.status(201).json({ success: true, data: forClient(topic), reused: false });
  } catch (error) { return res.status(error.status || (error.name === 'VersionError' ? 409 : 500)).json({ success: false, message: error.message }); }
});

function reopenAfterConcernChange(topic) {
  if (topic.conclusion?.status === 'confirmed') {
    topic.conclusionHistory.push({ content: topic.conclusion.content, managementTargets: topic.conclusion.managementTargets || [],
      confirmedAt: topic.conclusion.confirmedAt, confirmedBy: topic.conclusion.confirmedBy,
      confirmedByName: topic.conclusion.confirmedByName, reason: '待研判问题发生变化' });
    topic.conclusion.status = 'draft';
    topic.conclusion.confirmedAt = null;
    topic.conclusion.confirmedBy = null;
    topic.conclusion.confirmedByName = '';
  }
  invalidateCustomerDiscussion(topic);
  topic.lastActivityAt = new Date();
}

router.post('/patients/:patientId/ai-case-reviews/:topicId/sync-chronic-concerns', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    if (!['familyDoctor', 'superadmin'].includes(req.staff.role) || (req.staff.role !== 'superadmin' && String(user.assignedFamilyDoctor) !== String(req.staff._id)))
      return res.status(403).json({ success: false, message: '仅该客户健康顾问可同步慢病线索' });
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id, reviewType: 'annual', status: { $ne: 'archived' } });
    if (!topic) return res.status(404).json({ success: false, message: '年度研判不存在' });
    if (topic.generation?.status === 'running') return res.status(409).json({ success: false, message: 'AI正在分析，请等待完成后同步' });
    const result = require('../utils/annualComprehensiveReview').reviewedChronicConcerns(user.aiHealthSummary, topic.annualPlanYear, user.healthRiskTags);
    if (result.sourceStatus !== 'reviewed') return res.json({ success: true, data: forClient(topic), added: 0, sourceStatus: result.sourceStatus });
    const existingKeys = new Set((topic.concerns || []).map(row => row.key));
    const additions = result.concerns.filter(row => !existingKeys.has(row.key));
    if ((topic.concerns || []).length + additions.length > 100) return res.status(409).json({ success: false, message: '本年度关注问题已达上限，请先整理研判' });
    if (additions.length) {
      topic.concerns.push(...additions.map(row => ({ ...row, id: new mongoose.Types.ObjectId().toString() })));
      topic.markModified('concerns');
      reopenAfterConcernChange(topic);
      await topic.save();
    }
    return res.json({ success: true, data: forClient(topic), added: additions.length, sourceStatus: 'reviewed', reviewedCount: result.concerns.length });
  } catch (error) { return res.status(error.name === 'VersionError' ? 409 : 500).json({ success: false, message: error.message }); }
});

router.post('/patients/:patientId/ai-case-reviews/:topicId/concerns', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    if (!['familyDoctor', 'superadmin'].includes(req.staff.role) || (req.staff.role !== 'superadmin' && String(user.assignedFamilyDoctor) !== String(req.staff._id)))
      return res.status(403).json({ success: false, message: '仅该客户健康顾问可纳入关注' });
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id, reviewType: 'annual', status: { $ne: 'archived' } });
    if (!topic) return res.status(404).json({ success: false, message: '年度研判不存在' });
    if (topic.generation?.status === 'running') return res.status(409).json({ success: false, message: 'AI正在分析，请等待完成后纳入关注' });
    const source = await concernSource(user, req.body || {});
    if (req.body.issueTitle !== undefined) {
      const issueTitle = String(req.body.issueTitle || '').trim();
      if (issueTitle.length < 2 || issueTitle.length > 60) return res.status(400).json({ success: false, message: '请填写2至60字的具体问题' });
      source.key += `:issue:${issueTitle.toLocaleLowerCase().replace(/[\s，。；：、]+/g, '')}`;
      source.title = issueTitle;
    }
    const existing = (topic.concerns || []).find(row => row.key === source.key);
    if (existing) {
      if (existing.evidence === source.evidence && JSON.stringify(existing.source) === JSON.stringify(source.source))
        return res.json({ success: true, data: forClient(topic), reused: true });
      Object.assign(existing, { evidence: source.evidence, source: source.source, status: 'suggested', pathway: 'undecided', note: '', sourceUpdatedAt: new Date() });
      topic.markModified('concerns');
      reopenAfterConcernChange(topic);
      await topic.save();
      return res.json({ success: true, data: forClient(topic), updated: true });
    }
    if ((topic.concerns || []).length >= 100) return res.status(409).json({ success: false, message: '本年度关注问题已达上限，请先整理研判' });
    topic.concerns.push({ id: new mongoose.Types.ObjectId().toString(), ...source,
      status: source.kind === 'ai_risk_scan' ? 'suggested' : 'included', pathway: 'undecided',
      includedBy: req.staff._id, includedByName: req.staff.name || '', includedAt: new Date() });
    reopenAfterConcernChange(topic);
    await topic.save();
    return res.status(201).json({ success: true, data: forClient(topic), reused: false });
  } catch (error) { return res.status(error.status || (error.name === 'VersionError' ? 409 : 500)).json({ success: false, message: error.message }); }
});

router.post('/patients/:patientId/ai-case-reviews/:topicId/import-specialty', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    if (!['familyDoctor', 'superadmin'].includes(req.staff.role) || (req.staff.role !== 'superadmin' && String(user.assignedFamilyDoctor) !== String(req.staff._id)))
      return res.status(403).json({ success: false, message: '仅该客户健康顾问可整合年度研判' });
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id, reviewType: 'annual', status: { $ne: 'archived' } });
    if (!topic) return res.status(404).json({ success: false, message: '年度研判不存在' });
    if (topic.generation?.status === 'running') return res.status(409).json({ success: false, message: 'AI正在分析，请等待完成后整合问题' });
    const end = new Date(`${Number(topic.annualPlanYear) + 1}-01-01T00:00:00+08:00`);
    const specialty = await AiCaseReview.find({ user: user._id, reviewType: 'specialty', issueKey: { $ne: '' }, status: { $ne: 'archived' }, createdAt: { $lt: end } }).sort({ createdAt: 1 }).limit(100).lean();
    const existingKeys = new Set((topic.concerns || []).map(row => row.key));
    const additions = specialty.filter(row => !existingKeys.has(`legacy_specialty:${row._id}`)).map(row => ({
      id: new mongoose.Types.ObjectId().toString(), key: `legacy_specialty:${row._id}`, kind: 'specialty_issue',
      title: String(row.title || '').replace(/专项研判$/, ''),
      evidence: (row.sourceLinks || []).map(link => `${link.source?.checkDate || link.source?.year || '日期待核实'}：${link.title}${link.evidence ? `；${link.evidence}` : ''}`).join('\n').slice(0, 1600),
      source: { topicId: String(row._id), links: row.sourceLinks || [] }, status: 'included', pathway: 'undecided',
      note: row.conclusion?.status === 'confirmed' ? `原单项研判已确认，请在综合研判中复核：${String(row.conclusion.content || '').slice(0, 400)}` : '原单项研判尚未确认，请结合其他问题及五年趋势重新核对',
      includedByName: '既有单项主题', includedAt: new Date(),
    }));
    if ((topic.concerns || []).length + additions.length > 100) return res.status(409).json({ success: false, message: '本年度关注问题已达上限，请先整理研判' });
    if (additions.length) {
      topic.concerns.push(...additions);
      topic.markModified('concerns');
      reopenAfterConcernChange(topic);
      await topic.save();
    }
    return res.json({ success: true, data: forClient(topic), added: additions.length });
  } catch (error) { return res.status(error.name === 'VersionError' ? 409 : 500).json({ success: false, message: error.message }); }
});

router.patch('/patients/:patientId/ai-case-reviews/:topicId/concerns/:concernId', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    if (!['familyDoctor', 'superadmin'].includes(req.staff.role) || (req.staff.role !== 'superadmin' && String(user.assignedFamilyDoctor) !== String(req.staff._id)))
      return res.status(403).json({ success: false, message: '仅该客户健康顾问可整理关注问题' });
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id, reviewType: 'annual', status: { $ne: 'archived' } });
    if (!topic) return res.status(404).json({ success: false, message: '年度研判不存在' });
    if (topic.generation?.status === 'running') return res.status(409).json({ success: false, message: 'AI正在分析，请等待完成后调整问题去向' });
    const index = (topic.concerns || []).findIndex(row => row.id === req.params.concernId);
    if (index < 0) return res.status(404).json({ success: false, message: '关注问题不存在' });
    const status = req.body.status;
    const pathway = req.body.pathway;
    if (!['suggested', 'included', 'watch', 'excluded', 'duplicate'].includes(status) || !['undecided', 'specialist', 'nutrition', 'both', 'followup'].includes(pathway))
      return res.status(400).json({ success: false, message: '研判去向无效' });
    const note = String(req.body.note || '').trim();
    if (note.length > 500 || (['excluded', 'duplicate'].includes(status) && !note)) return res.status(400).json({ success: false, message: '排除或合并重复问题时请填写原因（500字以内）' });
    const title = req.body.title === undefined ? topic.concerns[index].title : String(req.body.title || '').trim();
    if (title.length < 2 || title.length > 60) return res.status(400).json({ success: false, message: '请填写2至60字的具体问题' });
    topic.concerns[index] = { ...topic.concerns[index], title, status, pathway, note, reviewedBy: req.staff._id,
      reviewedByName: req.staff.name || '', reviewedAt: new Date() };
    topic.markModified('concerns');
    reopenAfterConcernChange(topic);
    await topic.save();
    return res.json({ success: true, data: forClient(topic) });
  } catch (error) { return res.status(error.name === 'VersionError' ? 409 : 500).json({ success: false, message: error.message }); }
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
    let proposedTargets;
    try { proposedTargets = require('../utils/caseReviewManagementTargets').normalizeTargets(req.body.managementTargets || []); }
    catch (error) { return res.status(400).json({ success: false, message: error.message }); }
    const topic = await AiCaseReview.create({
      user: user._id, tenantId: user.tenantId || null, title,
      description: String(req.body.description || '').trim(),
      reviewType: VALID_REVIEW_TYPES.has(req.body.reviewType) ? req.body.reviewType : 'custom',
      requiresCustomerDiscussion: req.body.reviewType === 'annual',
      templateId: selectedTemplate?._id || null,
      templateSnapshot: selectedTemplate ? { name: selectedTemplate.name, target: selectedTemplate.content?.target || '研判结论', outputGuide: selectedTemplate.content?.outputGuide || '' } : null,
      contextScopes: sanitizeScopes(req.body.contextScopes),
      preferredProvider: 'qwen',
      conclusion: { status: 'draft', managementTargets: proposedTargets },
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
    if (topic.generation?.status === 'running') return res.status(409).json({ success: false, message: 'AI正在回复，请等待本轮完成后修改' });
    if (topic.annualPlanYear && ['title', 'description', 'reviewType', 'contextScopes', 'status'].some(key => req.body[key] !== undefined)) return res.status(409).json({ success: false, message: '年度综合研判固定议题和资料范围不可修改' });
    if (req.body.title !== undefined) topic.title = String(req.body.title).trim();
    if (req.body.description !== undefined) topic.description = String(req.body.description).trim();
    if (req.body.reviewType !== undefined && VALID_REVIEW_TYPES.has(req.body.reviewType)) topic.reviewType = req.body.reviewType;
    if (req.body.contextScopes !== undefined) topic.contextScopes = sanitizeScopes(req.body.contextScopes);
    if (req.body.managementTargets !== undefined) {
      let targets;
      try { targets = require('../utils/caseReviewManagementTargets').normalizeTargets(req.body.managementTargets); }
      catch (error) { return res.status(400).json({ success: false, message: error.message }); }
      const changed = JSON.stringify(targets) !== JSON.stringify((topic.conclusion?.managementTargets || []).map(row => ({ goal: row.goal, focus: row.focus, nutritionRelevant: row.nutritionRelevant === true })));
      if (topic.conclusion?.status === 'confirmed' && changed) {
        if (!['familyDoctor', 'superadmin'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '仅健康顾问可调整已确认目标' });
        const note = String(req.body.targetChangeNote || '').trim();
        if (!note || note.length > 500) return res.status(400).json({ success: false, message: '修改已确认目标时，请填写500字以内的沟通调整说明' });
        topic.conclusionHistory.push({ content: topic.conclusion.content,
          managementTargets: topic.conclusion.managementTargets || [], confirmedAt: topic.conclusion.confirmedAt,
          confirmedBy: topic.conclusion.confirmedBy, confirmedByName: topic.conclusion.confirmedByName,
          targetChangeNote: topic.conclusion.targetChangeNote || '' });
        topic.conclusion.managementTargets = targets;
        topic.conclusion.targetChangeNote = note;
        topic.conclusion.confirmedAt = new Date();
        topic.conclusion.confirmedBy = req.staff._id;
        topic.conclusion.confirmedByName = req.staff.name || '';
        invalidateCustomerDiscussion(topic);
      }
      if (topic.conclusion?.status !== 'confirmed') topic.conclusion.managementTargets = targets;
    }
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
    if (topic.generation?.status === 'running') return res.status(409).json({ success: false, message: 'AI正在回复，请等待本轮完成后修改' });
    if (topic.annualPlanYear) return res.status(409).json({ success: false, message: '年度综合研判不能删除' });
    topic.status = 'archived';
    topic.lastActivityAt = new Date();
    await topic.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/patients/:patientId/ai-case-reviews/:topicId/messages', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    const autoStart = req.body.autoStart === true;
    let exam = null;
    if (autoStart) {
      const candidate = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id, status: { $ne: 'archived' } });
      if (!candidate) return res.status(404).json({ success: false, message: '研判主题不存在' });
      const existingStart = candidate.messages.find(item => item.role === 'staff' && item.requestId === req.body.requestId && item.content === AUTO_REVIEW_MESSAGE);
      if (!['annual', 'checkup'].includes(candidate.reviewType) || (candidate.messages.length && !existingStart) || !candidate.contextScopes.includes('reports'))
        return res.status(409).json({ success: false, message: '自动首轮研判仅用于尚未讨论且包含体检报告的年度或体检主题' });
      exam = await latestExam(user._id);
      if (!exam && candidate.reviewType !== 'annual') return res.status(409).json({ success: false, message: '尚无已审核的体检报告；请先核实报告，或手动输入研判问题' });
    }
    const accepted = await acceptSend(AiCaseReview, {
      patientId: user._id, topicId: req.params.topicId,
      staff: { _id: req.staff._id, name: req.staff.name, role: req.staff.role, roleLabel: ROLE_LABEL[req.staff.role] },
      content: autoStart ? AUTO_REVIEW_MESSAGE : req.body.content,
      attachments: autoStart ? [] : req.body.attachments, requestId: req.body.requestId,
    });
    const { topic } = accepted;
    const legacy = req.body.requestId === undefined || req.body.requestId === null || req.body.requestId === '';
    if (!legacy || !accepted.claimed) {
      res.status(topic.generation?.status === 'running' ? 202 : 200).json({ success: true, data: forClient(topic) });
      if (!accepted.claimed) return;
    }
    // New clients poll persisted state; already-open legacy pages still expect the reply in this response.
    const completion = finishSend(AiCaseReview, topic, async () => {
      const message = topic.messages.find(item => item.role === 'staff' && item.requestId === topic.generation.requestId);
      const { content, attachments } = message;
      const snapshot = await buildContext(user, topic.contextScopes);
      const linkedReportIds = [...new Set((topic.sourceLinks || []).flatMap(row => [row.source?.reportId, ...(row.source?.reportIds || [])]).filter(id => mongoose.isValidObjectId(id)).map(String))];
      if (linkedReportIds.length) {
        const linkedReports = await MedicalReport.find({ _id: { $in: linkedReportIds }, user: user._id, audit_status: 'audited' })
          .select('title reportYear checkDate institution examConclusion reportItems aiSummary').lean();
        snapshot.reports = [...linkedReports, ...(snapshot.reports || []).filter(row => !linkedReportIds.includes(String(row._id)))].slice(0, 30);
      }
      const automatic = content === AUTO_REVIEW_MESSAGE;
      if (automatic) {
        exam ||= await latestExam(user._id);
        if (exam) {
          snapshot.reports = [exam, ...(snapshot.reports || []).filter(item => String(item._id) !== String(exam._id))].slice(0, 30);
          snapshot.sources.unshift(`优先分析最近一次已审核体检报告：${exam.checkDate || exam.reportYear || '日期待核实'} · ${exam.title}`);
        } else if (topic.reviewType === 'annual') {
          snapshot.sources.unshift('暂无已审核的体检报告；仅依据已审核资料和已纳入问题提出待核实判断，不编造体检所见');
        } else throw new Error('已审核体检报告已不可用，请核实后重试');
      }
      const isSupplement = topic.messages.length > 1;
      const history = topic.messages.slice(isSupplement ? -7 : -13, -1).map(item => ({ role: item.role === 'ai' ? 'assistant' : 'user', content: item.content }));
      const proposedTargets = topic.conclusion?.managementTargets || [];
      const concerns = (topic.concerns || []).filter(row => !['excluded', 'duplicate'].includes(row.status));
      snapshot.reviewConcerns = concerns;
      if (concerns.length) snapshot.sources.push(`年度待研判问题：${concerns.length}项（逐项保留报告或已审趋势来源）`);
      if (topic.sourceLinks?.length) {
        snapshot.specialtySources = topic.sourceLinks;
        snapshot.sources.push(...topic.sourceLinks.map(row => `专病问题来源：${row.source?.checkDate || row.source?.year || '日期待核实'} · ${row.title}`));
      }
      const topicGuide = [topic.title, topic.description, topic.templateSnapshot?.outputGuide ? `固定研判输出：${topic.templateSnapshot.outputGuide}` : '',
        topic.sourceLinks?.length ? `健康顾问选定的单个专病问题及来源（优先核对，不可将报告所见直接当诊断）：${JSON.stringify(topic.sourceLinks.map(row => ({ title: row.title, evidence: row.evidence, source: row.source })))}` : '',
        concerns.length ? `健康顾问纳入及AI扫描的待研判问题（均须核实，不能当作已确诊；按已标注去向讨论）：${JSON.stringify(concerns.map(row => ({ title: row.title, evidence: row.evidence, kind: row.kind, status: row.status, pathway: row.pathway, note: row.note, source: row.source })))}` : '',
        proposedTargets.length ? `创建主题时填写的拟管理目标和干预重点（尚未核实，只作为研判方向，不能当作已确认事实）：${JSON.stringify(proposedTargets)}` : ''].filter(Boolean).join('\n');
      const isAnnualReview = topic.reviewType === 'annual' && !!topic.annualPlanYear;
      const specialtySummary = isAnnualReview ? await annualSpecialtySummary(user._id, topic.annualPlanYear) : [];
      const annualBoundary = isAnnualReview ? '年度研判把健康顾问纳入的具体问题、五年健康趋势、慢病线索及重大疾病风险维度作为同一组资料。先逐项核实依据，再分析具体问题之间及其与五年趋势之间有证据支持的关联、时间变化和共同影响，最后形成综合优先级、医疗管理目标和专科/就医、营养师评估或随访去向。不得把仅仅共存当作因果，必要的专科意见未取得时标记待确认。营养干预具体方案由营养师独立制定和发出。' : '';
      const incrementalGuide = isSupplement
        ? '这是一次补充讨论。只回答本轮新增信息，严禁重述既往完整病史、检查清单、管理方案或原分析。输出最多3个短段：1.新增信息解读；2.修订说明（没有则写“无修订”）；3.对阶段性结论的影响。全文控制在300个中文字以内，每段最多3点。最新更正信息优先于旧信息。'
        : isAnnualReview
          ? '这是年度综合研判首次讨论。按固定六项议题依次给出初步分析，每项最多3个要点，全文不超过1200个中文字；优先列明有来源的关键事实、管理目标与待核实资料，不重复罗列全部病史、检查数值或旧方案。资料不足的议题明确写待核实，不编造结论。'
          : '这是本主题首次讨论，请围绕本轮问题形成初步分析，并标明待确认信息。';
      const autoGuide = automatic
        ? `${isAnnualReview ? '这是年度综合研判首次讨论，保持主题规定的固定六项议题，每项最多3点，全文不超过1200个中文字。' : '这是本主题首次讨论。'}${exam ? '先从最近一次已审核体检报告列出关键问题及报告日期/项目依据（最多5条）' : '暂无已审核的体检报告，请从已审核健康趋势、AI风险提示及已纳入问题列出可核对的关键问题（最多5条），不得虚构报告所见'}，区分已确认事实与待核实信息；再逐条写拟目标，严格使用“目标：……；干预重点：……”格式（最多5条，资料不足不编造数值）；最后结合既有资料给出简明研判分析和待审核方案。目标仅是草稿，须由健康顾问确认。`
        : incrementalGuide;
      const result = await providerAdapter.reply({ preferred: topic.preferredProvider, sessionId: topic.providerSessionId || String(topic._id), prompt: `【专项研判主题与要求】\n${topicGuide}\n${annualBoundary}\n${isAnnualReview ? `\n【既有单项主题的历史资料】\n${specialtySummary.length ? JSON.stringify(specialtySummary) : '暂无。'}\n这些资料与年度问题清单一起综合分析；未确认的历史单项结论仅列为待核实。` : ''}\n\n【分析方式】\n${autoGuide}\n\n【本轮新增信息】\n${content || '请分析本轮上传的图文资料'}`, context: snapshot, attachments, history, maxTokens: isSupplement ? 900 : isAnnualReview || automatic ? 3200 : 1800 });
      if (automatic && !proposedTargets.length) result.managementTargets = require('../utils/caseReviewManagementTargets').proposeTargetsFromActions(result.content.split(/\r?\n/));
      return { result, snapshot: result.contextSnapshot || snapshot };
    });
    if (legacy) {
      await completion;
      const current = await AiCaseReview.findOne({ _id: topic._id, user: user._id });
      if (current?.generation?.status === 'failed') return res.status(500).json({ success: false,
        message: `提问已保存，AI回复失败：${current.generation.error}。请刷新页面后重试AI回复。` });
      res.json({ success: true, data: forClient(current) });
    } else {
      void completion.catch(err => console.error('[ai-case-review] Persisting reply state failed:', err.message));
    }
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
});

router.patch('/patients/:patientId/ai-case-reviews/:topicId/messages/:messageId', staffAuth, async (req, res) => {
  try {
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id });
    if (!topic) return res.status(404).json({ success: false, message: '研判主题不存在' });
    if (topic.generation?.status === 'running') return res.status(409).json({ success: false, message: 'AI正在回复，请等待本轮完成后修改' });
    const message = topic.messages.id(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: '讨论记录不存在' });
    const content = String(req.body.content || '').trim();
    if (!content) return res.status(400).json({ success: false, message: '讨论内容不能为空' });
    message.content = content;
    const messageIndex = topic.messages.findIndex(item => String(item._id) === req.params.messageId);
    if (message.role === 'staff' && topic.messages[messageIndex + 1]?.role === 'ai') topic.messages.splice(messageIndex + 1, 1);
    if (topic.conclusion?.status === 'confirmed') topic.conclusionHistory.push({
      content: topic.conclusion.content, managementTargets: topic.conclusion.managementTargets || [],
      confirmedAt: topic.conclusion.confirmedAt, confirmedBy: topic.conclusion.confirmedBy,
    });
    topic.conclusion = { content: '', structured: null, managementTargets: topic.conclusion?.managementTargets || [], status: 'draft' };
    invalidateCustomerDiscussion(topic);
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
    if (topic.generation?.status === 'running') return res.status(409).json({ success: false, message: 'AI正在回复，请等待本轮完成后修改' });
    const index = topic.messages.findIndex(item => String(item._id) === req.params.messageId);
    if (index < 0) return res.status(404).json({ success: false, message: '讨论记录不存在' });
    const deleteCount = topic.messages[index].role === 'staff' && topic.messages[index + 1]?.role === 'ai' ? 2 : 1;
    topic.messages.splice(index, deleteCount);
    if (topic.conclusion?.status === 'confirmed') topic.conclusionHistory.push({
      content: topic.conclusion.content, managementTargets: topic.conclusion.managementTargets || [],
      confirmedAt: topic.conclusion.confirmedAt, confirmedBy: topic.conclusion.confirmedBy,
    });
    topic.conclusion = { content: '', structured: null, managementTargets: topic.conclusion?.managementTargets || [], status: 'draft' };
    invalidateCustomerDiscussion(topic);
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
    if (topic.generation?.status === 'running') return res.status(409).json({ success: false, message: 'AI正在回复，请等待本轮完成后修改' });
    if (!topic.messages.length) return res.status(400).json({ success: false, message: '暂无讨论内容' });
    const transcript = topic.messages.map(item => `${item.role === 'ai' ? 'AI' : `${item.staffName}（${item.staffRole}）`}：${item.content}`).join('\n');
    const concernSummary = (topic.concerns || []).map(row => `${row.status} / ${row.pathway}：${row.title}；依据：${row.evidence || '待核实'}；说明：${row.note || '无'}`).join('\n');
    const specialtySummary = topic.reviewType === 'annual' && topic.annualPlanYear ? await annualSpecialtySummary(user._id, topic.annualPlanYear) : [];
    const prompt = `请将以下医护团队专题研判整理为简明、可执行的阶段性结论。固定使用六个栏目：核心结论、已确认事实、阶段变化、重点风险、下一步行动、待补信息。年度研判须综合具体问题、五年趋势、慢病与重大疾病风险，说明有证据支持的问题间关联及共同管理优先级，不逐项割裂罗列，也不把共存误写成因果。以时间较新的更正和补充为准，排除已被修订的信息，只把当前正确、有效的信息写入结论；若存在实质修订，在“阶段变化”中说明修订了什么。每栏最多5条，每条只表达一个要点；下一步行动必须写清事项、时间或频次、责任角色（资料不足写“待确认”）。涉及持续管理的行动请采用“目标：……；干预重点：……；时间/频次：……；责任角色：……”格式，目标仅来自已确认依据；单次就医或检查照常写行动，不强行编造管理目标。不要输出Markdown符号、横线、免责声明、生成时间或审核人；不得把AI推测写成已确认事实。营养相关事项只写明转营养师评估，不代营养师制定具体干预方案。${topic.templateSnapshot?.outputGuide ? `本主题重点输出范围：${topic.templateSnapshot.outputGuide}。` : ''}\n\n主题：${topic.title}\n待研判问题及人工分流：\n${concernSummary || '暂无结构化问题'}\n${topic.annualPlanYear ? `既有单项主题历史资料（已确认的可引用，未确认的仅列待核实）：\n${specialtySummary.length ? JSON.stringify(specialtySummary) : '暂无'}\n` : ''}讨论记录：\n${transcript}`;
    const result = await providerAdapter.reply({ preferred: topic.preferredProvider, sessionId: topic.providerSessionId || String(topic._id), prompt, context: { sources: [] }, attachments: [], history: [] });
    const structured = toStructuredAssessment(result.content, topic.title);
    if (topic.conclusion?.status === 'confirmed') topic.conclusionHistory.push({
      content: topic.conclusion.content, managementTargets: topic.conclusion.managementTargets || [],
      confirmedAt: topic.conclusion.confirmedAt, confirmedBy: topic.conclusion.confirmedBy,
    });
    topic.conclusion = { content: assessmentToPlainText(structured), structured,
      managementTargets: topic.conclusion?.managementTargets?.length ? topic.conclusion.managementTargets
        : require('../utils/caseReviewManagementTargets').proposeTargetsFromActions(structured.actions),
      status: 'draft', generatedAt: new Date(), confirmedAt: null, confirmedBy: null, confirmedByName: '', serviceRecordId: null };
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
    if (topic.generation?.status === 'running') return res.status(409).json({ success: false, message: 'AI正在回复，请等待本轮完成后修改' });
    if (topic.annualPlanYear && (topic.concerns || []).some(row => row.status === 'suggested' || (row.status === 'included' && (!row.pathway || row.pathway === 'undecided'))))
      return res.status(409).json({ success: false, message: '请先逐条核实AI提示，并确定已纳入问题的专业去向' });
    const content = String(req.body.content || topic.conclusion?.content || '').trim();
    if (!content) return res.status(400).json({ success: false, message: '结论不能为空' });
    const structured = toStructuredAssessment(content, topic.title);
    let managementTargets;
    try { managementTargets = require('../utils/caseReviewManagementTargets').normalizeTargets(req.body.managementTargets ?? topic.conclusion?.managementTargets ?? []); }
    catch (error) { return res.status(400).json({ success: false, message: error.message }); }
    const shouldArchive = req.body.writeToPhaseAssessment === true
      || /阶段性.*评估/.test(`${topic.title} ${topic.description}`)
      || topic.messages.some(item => item.role === 'staff' && /写入.{0,8}阶段性健康评估|阶段性健康评估.{0,8}写入/.test(item.content));
    let serviceRecord = null;
    if (shouldArchive) {
      return res.status(409).json({ success: false, message: '阶段性健康评估必须先进入营养师初审，不能从AI辅助研判直接入档；请使用页面中的“生成阶段评估草稿”入口' });
    }
    const targetsChanged = topic.conclusion?.status === 'confirmed' && JSON.stringify(managementTargets) !== JSON.stringify((topic.conclusion.managementTargets || []).map(row => ({ goal: row.goal, focus: row.focus, nutritionRelevant: row.nutritionRelevant === true })));
    const targetChangeNote = String(req.body.targetChangeNote || '').trim();
    if (targetsChanged && (!targetChangeNote || targetChangeNote.length > 500)) return res.status(400).json({ success: false, message: '修改已确认目标时，请填写500字以内的沟通调整说明' });
    if (topic.conclusion?.status === 'confirmed') topic.conclusionHistory.push({
      content: topic.conclusion.content, managementTargets: topic.conclusion.managementTargets || [],
      confirmedAt: topic.conclusion.confirmedAt, confirmedBy: topic.conclusion.confirmedBy,
      confirmedByName: topic.conclusion.confirmedByName, targetChangeNote: topic.conclusion.targetChangeNote || '',
    });
    topic.conclusion = { content: assessmentToPlainText(structured), structured, managementTargets,
      status: 'confirmed', generatedAt: topic.conclusion?.generatedAt || new Date(), confirmedAt: new Date(),
      confirmedBy: req.staff._id, confirmedByName: req.staff.name || '', targetChangeNote: targetsChanged ? targetChangeNote : topic.conclusion?.targetChangeNote || '',
      serviceRecordId: serviceRecord?._id || topic.conclusion?.serviceRecordId || null };
    invalidateCustomerDiscussion(topic);
    topic.status = 'concluded'; topic.lastActivityAt = new Date();
    await topic.save();
    res.json({ success: true, data: forClient(topic), archivedToPhaseAssessment: Boolean(serviceRecord), customerPushEligible: serviceRecord?.structuredContent?.customerPushEligible === true, serviceRecordId: serviceRecord?._id || null });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/patients/:patientId/ai-case-reviews/:topicId/customer-discussion', staffAuth, async (req, res) => {
  try {
    if (!['familyDoctor', 'superadmin'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '仅健康顾问可确认客户沟通结果' });
    const user = await caseReviewPatientOr404(req, res); if (!user) return;
    const topic = await AiCaseReview.findOne({ _id: req.params.topicId, user: user._id, status: { $ne: 'archived' } });
    if (!topic) return res.status(404).json({ success: false, message: '研判主题不存在' });
    if (topic.reviewType !== 'annual' || topic.conclusion?.status !== 'confirmed') return res.status(409).json({ success: false, message: '请先由健康顾问确认年度研判结论' });
    const laterSpecialty = topic.annualPlanYear ? await AiCaseReview.findOne({ user: user._id, reviewType: 'specialty', issueKey: { $ne: '' }, status: { $ne: 'archived' },
      createdAt: { $lt: new Date(`${Number(topic.annualPlanYear) + 1}-01-01T00:00:00+08:00`) },
      'conclusion.status': 'confirmed', 'conclusion.confirmedAt': { $gt: topic.conclusion.confirmedAt } }).select('title').lean() : null;
    if (laterSpecialty) return res.status(409).json({ success: false, message: `“${laterSpecialty.title}”的单项结论晚于年度综合结论，请先核对并重新确认年度研判` });
    const version = topic.conclusion.confirmedAt?.toISOString();
    if (!version || req.body.confirmedAt !== version) return res.status(409).json({ success: false, message: '研判目标已更新，请刷新后重新核对沟通结果' });
    const status = req.body.status;
    if (!['no_change', 'adjusted'].includes(status)) return res.status(400).json({ success: false, message: '请选择无调整或已调整并确认' });
    const note = String(req.body.note || '').trim();
    if (note.length > 1000 || (status === 'adjusted' && !note)) return res.status(400).json({ success: false, message: '已调整时请填写1000字以内的客户沟通说明' });
    if (topic.customerDiscussion?.status && topic.customerDiscussion.status !== 'pending') topic.customerDiscussionHistory.push(topic.customerDiscussion);
    topic.customerDiscussion = { status, note, confirmedAt: new Date(), confirmedBy: req.staff._id,
      confirmedByName: req.staff.name || '', conclusionConfirmedAt: topic.conclusion.confirmedAt };
    topic.markModified('customerDiscussion');
    topic.lastActivityAt = new Date();
    await topic.save();
    return res.json({ success: true, data: forClient(topic) });
  } catch (error) { return res.status(error.name === 'VersionError' ? 409 : 500).json({ success: false, message: error.name === 'VersionError' ? '研判已被更新，请刷新后重试' : error.message }); }
});

module.exports = router;
