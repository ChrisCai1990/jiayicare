const AnnualPlan = require('../models/AnnualPlan');
const PlanTemplate = require('../models/PlanTemplate');
const User = require('../models/User');
const PhaseAssessment = require('../models/PhaseAssessment');
const { buildContext } = require('./aiCaseReviewContext');
const { chat } = require('./ai');

function periodFor(frequency, now = new Date()) {
  if (frequency === 'quarterly') return { key: `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`, label: `${now.getFullYear()}年第${Math.floor(now.getMonth() / 3) + 1}季度` };
  return { key: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, label: `${now.getFullYear()}年${now.getMonth() + 1}月` };
}

async function createAssessment({ plan, user, template }) {
  const frequency = template.content?.frequency === 'quarterly' ? 'quarterly' : 'monthly';
  const period = periodFor(frequency);
  const existing = await PhaseAssessment.exists({ annualPlanId: plan._id, templateId: template._id, periodKey: period.key });
  if (existing) return null;
  const scopes = Array.isArray(template.content?.contextScopes) && template.content.contextScopes.length
    ? template.content.contextScopes : ['healthProfile', 'reports', 'healthRecords', 'followups', 'plans'];
  const context = await buildContext(user, scopes);
  const focus = template.content?.focus || '目标达成、指标变化、执行情况、风险变化和下一步建议';
  const instructions = template.content?.instructions || '仅提出待审核建议，不得将推测写为事实；缺少数据时必须明确说明。';
  const prompt = `你是医护团队的阶段性健康评估助手。请按模板对会员进行${period.label}评估。不得诊断、开药或自动修改方案；所有建议须由健康顾问审核。

【模板关注重点】${focus}
【模板额外要求】${instructions}
【会员资料快照】${JSON.stringify(context).slice(0, 45000)}

请按以下结构输出中文：
一、已确认数据与变化；二、目标/执行进展；三、数据缺口或风险提醒；四、建议与下一阶段待讨论事项。`;
  const content = await chat([{ role: 'user', content: prompt }], { provider: 'qwen', systemPrompt: '只基于提供资料评估，不能补造事实。', maxTokens: 1400, temperature: 0.05, timeoutMs: 90000 });
  return PhaseAssessment.create({
    patientId: user._id, annualPlanId: plan._id, templateId: template._id,
    periodKey: period.key, periodLabel: period.label, content,
    evidenceSources: context.sources || [], templateSnapshot: { name: template.name, frequency, focus, instructions },
  });
}

async function scanAndCreatePhaseAssessments() {
  if (!process.env.QWEN_API_KEY) return 0;
  const templates = await PlanTemplate.find({ type: 'phase_assessment', status: 'active' }).lean();
  if (!templates.length) return 0;
  const plans = await AnnualPlan.find({ confirmedAt: { $ne: null } }).sort({ confirmedAt: -1 }).limit(500).lean();
  let created = 0;
  for (const plan of plans) {
    const user = await User.findById(plan.patientId).select('name age gender chronicDiseases healthProfile lifestyle aiHealthSummary clientBrand');
    if (!user) continue;
    for (const template of templates.filter(t => !t.clientBrand || t.clientBrand === user.clientBrand)) {
      try { if (await createAssessment({ plan, user, template })) created++; }
      catch (error) { console.error('[phase-assessment] create failed', String(plan.patientId), error.message); }
    }
  }
  if (created) console.log(`[phase-assessment] created ${created} pending reviews`);
  return created;
}

function startPhaseAssessmentScheduler() {
  scanAndCreatePhaseAssessments().catch(error => console.error('[phase-assessment] initial scan failed', error.message));
  // 每小时检查一次；periodKey 唯一索引保证同一客户/模板/周期不会重复生成。
  setInterval(() => scanAndCreatePhaseAssessments().catch(error => console.error('[phase-assessment] scan failed', error.message)), 60 * 60 * 1000);
}

module.exports = { createAssessment, scanAndCreatePhaseAssessments, startPhaseAssessmentScheduler };
