const crypto = require('crypto');
const mongoose = require('mongoose');
const HealthPlan = require('../models/HealthPlan');
const PlanTemplate = require('../models/PlanTemplate');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Task = require('../models/Task');
const FollowUp = require('../models/FollowUp');
const Draft = require('../models/NutritionInterventionDraft');

const error = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fixedId = key => new mongoose.Types.ObjectId(hash(key).slice(0, 24));
const trim = (value, max = 500) => String(value || '').trim().slice(0, max);
const validDay = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isFinite(date.getTime()) && new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) === value;
};
const chinaDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const asDate = value => new Date(`${value}T09:00:00+08:00`);

async function inputFor(plan) {
  if (plan.type !== 'nutrition' || plan.content?.nutritionTaskVersion !== 1) throw error('此方案未启用新版营养干预任务');
  const c = plan.content || {};
  const goal = trim(c.goal, 1000);
  const reviewDate = trim(c.nutritionReviewDate, 10);
  if (!goal) throw error('请先填写营养干预管理目标', 400);
  if (!validDay(reviewDate) || reviewDate < chinaDay()) throw error('请填写不早于今天的阶段复盘日期', 400);
  const user = await User.findById(plan.patientId).select('tenantId name lifestyle_data lifestyleHistory archiveVersionHistory assignedHealthManager assignedNutritionist assignedFamilyDoctor isDeleted').lean();
  if (!user || user.isDeleted) throw error('客户不存在或已删除', 404);
  if (!user.assignedHealthManager || !user.assignedNutritionist || !user.assignedFamilyDoctor) throw error('请先分配健管专员、营养师和健康顾问');
  const owners = await Admin.find({ _id: { $in: [user.assignedHealthManager, user.assignedNutritionist, user.assignedFamilyDoctor] }, staffStatus: 'active' }).select('_id role tenantId').lean();
  for (const [id, role] of [[user.assignedHealthManager, 'healthManager'], [user.assignedNutritionist, 'nutritionist'], [user.assignedFamilyDoctor, 'familyDoctor']]) {
    if (!owners.some(o => String(o._id) === String(id) && o.role === role && String(o.tenantId || '') === String(user.tenantId || ''))) throw error(`客户的${role}负责人无效，请先修正归属`);
  }
  const template = await PlanTemplate.findOne({ _id: c.templateId, type: 'nutrition', status: 'active', $or: [{ tenantId: user.tenantId || null }, { tenantId: null }] }).lean();
  if (!template) throw error('所选营养模板已失效，请由营养师重新选择');
  const lifestyle = require('./effectiveLifestyle').effectiveLifestyle(user);
  const verifiedLifestyle = (user.lifestyleHistory || []).some(row => row.recordedById || row.interviewId)
    || (user.archiveVersionHistory || []).some(row => row.confirmedBy && String(row.path || '').startsWith('lifestyle_data.'));
  if (!verifiedLifestyle || !Object.values(lifestyle).some(v => v && (typeof v !== 'object' || Object.keys(v).length))) throw error('请先由营养师核实生活方式资料，再生成干预任务');
  const rawTargets = Array.isArray(c.nutritionTargets) && c.nutritionTargets.length
    ? c.nutritionTargets : [{ metric: c.nutritionMetric, baseline: c.nutritionBaseline, target: c.nutritionTarget }];
  const nutritionTargets = rawTargets.map(row => ({ metric: trim(row?.metric, 100), baseline: trim(row?.baseline, 200), target: trim(row?.target, 200) }));
  if (nutritionTargets.length > 32 || nutritionTargets.some(row => !row.metric || !row.baseline || !row.target)) {
    throw error('请在方案中逐项核实观察指标、基线和阶段目标', 400);
  }
  const sourceSnapshot = {
    goal, metric: trim(c.nutritionMetric, 200), baseline: trim(c.nutritionBaseline, 200), target: trim(c.nutritionTarget, 200),
    nutritionTargets,
    reviewDate, moduleData: c.moduleData || {}, templateId: String(template._id), templateName: template.name,
    templateContent: template.content || {}, lifestyle,
  };
  return { user, template, sourceSnapshot, sourceFingerprint: hash(sourceSnapshot), reviewDate };
}

function parseActions(response) {
  const match = String(response || '').match(/\{[\s\S]*\}/);
  if (!match) throw error('AI没有返回可审核的任务草稿');
  let data;
  try { data = JSON.parse(match[0]); } catch { throw error('AI任务草稿格式错误，请重试'); }
  if (!Array.isArray(data.actions) || data.actions.length < 1 || data.actions.length > 6) throw error('AI任务草稿须包含1至6条客户行动');
  const actions = data.actions.map((item, index) => ({
    key: `action-${index + 1}`,
    title: trim(item.title, 80), instruction: trim(item.instruction, 800),
    frequency: trim(item.frequency, 100), evidence: trim(item.evidence, 200),
  }));
  if (actions.some(item => !item.title || !item.instruction || !item.evidence)) throw error('AI任务草稿缺少行动或观察依据');
  return actions;
}

async function generate(plan) {
  if (!plan.pushedAt || plan.status !== 'active' || plan.content?.aiStatus === 'pending') throw error('营养方案须先由营养师审核并推送');
  const input = await inputFor(plan);
  const previous = await Draft.findById(plan._id).lean();
  if (previous?.status === 'published') return previous;
  if (previous?.status === 'publishing') return previous;
  if (previous?.sourceFingerprint === input.sourceFingerprint && previous?.status === 'pending_review') return previous;
  if (previous?.status === 'generating' && Date.now() - new Date(previous.updatedAt).getTime() < 10 * 60000) return previous;
  const token = crypto.randomUUID();
  const claim = { patientId: plan.patientId, tenantId: input.user.tenantId || null,
    templateId: input.template._id, sourceFingerprint: input.sourceFingerprint, sourceSnapshot: input.sourceSnapshot,
    reviewDate: input.reviewDate, status: 'generating', generationToken: token, generationError: '', actions: [] };
  try {
    await Draft.findOneAndUpdate({ _id: plan._id, $or: [
      { status: { $nin: ['generating', 'publishing', 'published'] } },
      { status: 'generating', updatedAt: { $lt: new Date(Date.now() - 10 * 60000) } },
    ] }, { $set: claim }, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (e) {
    if (e.code === 11000) return Draft.findById(plan._id).lean();
    throw e;
  }
  try {
    const { chat } = require('./ai');
    const prompt = `你是营养师的任务整理助手。只根据已确认营养方案、生活方式记录和营养模板，把管理目标拆成1至6条客户可执行的行动草稿。不可诊断、开药、改变医嘱、虚构指标或与模板禁忌冲突。缺少量化目标时保留原目标文字，不编造数值。不要生成每日员工待办。仅输出JSON对象：{"actions":[{"title":"简短行动名称","instruction":"具体做法","frequency":"执行或记录频率","evidence":"阶段复盘要核对的记录"}]}。资料：${JSON.stringify(input.sourceSnapshot).slice(0, 30000)}`;
    const response = await chat([{ role: 'user', content: prompt }], { maxTokens: 1800, temperature: 0, jsonMode: true, timeoutMs: 90000 });
    const actions = parseActions(response);
    await Draft.updateOne({ _id: plan._id, generationToken: token, status: 'generating' }, { $set: { actions, status: 'pending_review', generationError: '' } });
  } catch (e) {
    await Draft.updateOne({ _id: plan._id, generationToken: token, status: 'generating' }, { $set: { status: 'failed', generationError: trim(e.message, 300) } });
    throw e;
  }
  return Draft.findById(plan._id).lean();
}

async function publish(plan, draft, actor, actions) {
  if (draft.status !== 'pending_review' && draft.status !== 'publishing') throw error('草稿当前不能发布');
  const input = await inputFor(plan);
  if (draft.sourceFingerprint !== input.sourceFingerprint) throw error('方案、模板或生活方式已变化，请重新生成任务草稿');
  const reviewed = Array.isArray(actions) ? actions.map((item, index) => ({ key: `action-${index + 1}`, title: trim(item.title, 80), instruction: trim(item.instruction, 800), frequency: trim(item.frequency, 100), evidence: trim(item.evidence, 200) })) : draft.actions;
  if (!reviewed.length || reviewed.length > 6 || reviewed.some(a => !a.title || !a.instruction || !a.evidence)) throw error('请补齐1至6条客户行动及观察依据', 400);
  const claim = await Draft.findOneAndUpdate({ _id: draft._id, status: 'pending_review', sourceFingerprint: input.sourceFingerprint },
    { $set: { status: 'publishing', actions: reviewed, approvedBy: actor._id, approvedAt: new Date() }, $inc: { revision: 1 } }, { new: true });
  if (!claim && draft.status !== 'publishing') throw error('草稿已变化，请刷新');
  const final = claim || await Draft.findById(draft._id).lean();
  const dueDate = final.reviewDate;
  for (const [index, action] of final.actions.entries()) {
    const key = `nutrition:${plan._id}:${final.sourceFingerprint}:customer:${index}`;
    await Task.updateOne({ _id: fixedId(key) }, { $setOnInsert: {
      user: plan.patientId, title: action.title, description: `${action.instruction}\n执行或记录频率：${action.frequency || '按营养师方案'}\n阶段核对：${action.evidence}`,
      category: '营养干预', type: 'record', status: 'pending', dueDate, sourceTaskKey: key,
    } }, { upsert: true });
  }
  const stages = [
    { key: 'manager', role: 'healthManager', assignee: input.user.assignedHealthManager, taskRole: 'executor', blocked: false, dependsOn: null,
      theme: `营养干预阶段随访 · ${plan.title}`, content: `核对客户行动执行情况、生活方式记录、障碍和目标指标；将事实反馈营养师。目标：${input.sourceSnapshot.goal}` },
    { key: 'nutritionist', role: 'nutritionist', assignee: input.user.assignedNutritionist, taskRole: 'supervisor', blocked: true, dependsOn: 'manager',
      theme: `营养干预阶段专业评估 · ${plan.title}`, content: '根据健管随访和客户记录，分析执行程度、指标变化、方案适配及未达目标原因；提出继续或调整建议。' },
    { key: 'advisor', role: 'familyDoctor', assignee: input.user.assignedFamilyDoctor, taskRole: '', blocked: true, dependsOn: 'nutritionist',
      theme: `营养干预阶段整体复盘 · ${plan.title}`, content: '查看营养师阶段评估，分析管理目标达成与偏差原因，记录继续、调整、补资料、跨专业协作或结束的决定。此任务不是年度营养方案审核。' },
  ];
  for (const stage of stages) {
    const key = `nutrition:${plan._id}:${final.sourceFingerprint}:${stage.key}`;
    const previousId = stage.dependsOn ? fixedId(`nutrition:${plan._id}:${final.sourceFingerprint}:${stage.dependsOn}`) : null;
    await FollowUp.updateOne({ _id: fixedId(key) }, { $setOnInsert: {
      patientId: plan.patientId, tenantId: input.user.tenantId || null, staffId: stage.assignee, assignedTo: stage.assignee,
      date: asDate(dueDate), remindAt: asDate(dueDate), nextFollowUpDate: asDate(dueDate),
      theme: stage.theme, plannedContent: stage.content, content: stage.content, status: 'planned',
      sourceType: 'health_plan', sourceHealthPlanId: plan._id, workflowKey: `nutrition:${plan._id}:${final.sourceFingerprint}`,
      taskRole: stage.taskRole, dependsOnTaskId: previousId, isBlocked: stage.blocked,
      activationEvent: stage.blocked ? 'previous_completed' : '',
      formData: { nutritionIntervention: { draftId: final._id, stage: stage.key, goal: input.sourceSnapshot.goal,
        nutritionTargets: input.sourceSnapshot.nutritionTargets, reviewDate: dueDate } },
    } }, { upsert: true });
  }
  await Draft.updateOne({ _id: final._id, status: 'publishing' }, { $set: { status: 'published', publishedAt: new Date() } });
  return Draft.findById(final._id).lean();
}

module.exports = { inputFor, generate, publish, parseActions, fixedId };
