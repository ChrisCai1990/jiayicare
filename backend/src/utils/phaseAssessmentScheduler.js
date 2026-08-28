const AnnualPlan = require('../models/AnnualPlan');
const PlanTemplate = require('../models/PlanTemplate');
const User = require('../models/User');
const PhaseAssessment = require('../models/PhaseAssessment');
const { buildStageAssessmentContext } = require('./aiCaseReviewContext');
const { chat } = require('./ai');

function periodFor(frequency, now = new Date(), confirmedAt) {
  if (frequency === 'yearly') {
    if (!confirmedAt) return null;
    const startedAt = new Date(confirmedAt);
    const completedMonths = (now.getFullYear() - startedAt.getFullYear()) * 12 + now.getMonth() - startedAt.getMonth()
      - (now.getDate() < startedAt.getDate() ? 1 : 0);
    // 满 11 个月即启动首份年度复盘，为第 12 个月的续约准备预留人工处理时间；以后每 12 个月重复一次。
    if (completedMonths < 11) return null;
    const reviewCycle = 1 + Math.floor((completedMonths - 11) / 12);
    return { key: `Y${reviewCycle}`, label: `年度管理第${reviewCycle}年复盘（续约准备）` };
  }
  if (frequency === 'quarterly') return { key: `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`, label: `${now.getFullYear()}年第${Math.floor(now.getMonth() / 3) + 1}季度` };
  return { key: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, label: `${now.getFullYear()}年${now.getMonth() + 1}月` };
}

async function createAssessment({ plan, user, template }) {
  const frequency = ['monthly', 'quarterly', 'yearly'].includes(template.content?.frequency)
    ? template.content.frequency : 'monthly';
  const period = periodFor(frequency, new Date(), plan.confirmedAt);
  if (!period) return null;
  const existing = await PhaseAssessment.exists({ annualPlanId: plan._id, templateId: template._id, periodKey: period.key });
  if (existing) return null;
  const windowDays = template.content?.windowDays === 14 ? 14 : 30;
  const context = await buildStageAssessmentContext(user, windowDays);
  const focus = template.content?.focus || '阶段数据变化、生活方式关联、潜在风险和下一步计划';
  const instructions = template.content?.instructions || '仅提出待审核建议，不得将推测写为事实；缺少数据时必须明确说明。';
  const minimumData = template.content?.minimumData || '资料不足时必须明确列为数据缺口。';
  const outputSections = Array.isArray(template.content?.outputSections) && template.content.outputSections.length
    ? template.content.outputSections : ['阶段数据变化', '生活方式关联分析', '潜在风险与数据缺口', '下一阶段行动规划'];
  const prompt = `你是医护团队的阶段性健康评估助手。请按模板对会员进行${period.label}评估。核心主线必须是“阶段数据变化→生活方式关联→潜在风险→下一步规划”。不得诊断、开药或自动修改方案；所有评估必须先由营养师审核，涉及临床问题时再由健康顾问复审。

【模板关注重点】${focus}
【模板额外要求】${instructions}
【最低数据要求】${minimumData}
【阶段资料快照】${JSON.stringify(context).slice(0, 45000)}

请严格按以下四个栏目输出中文：
一、${outputSections[0]}；二、${outputSections[1]}；三、${outputSections[2]}；四、${outputSections[3]}。
第一部分只写${windowDays}天窗口内的监测变化和覆盖情况；第二部分只分析阶段变化与饮食、运动、睡眠、饮酒、情绪、依从性的时间关联，证据不足写“可能相关/待验证”，不得写成因果；第三部分写可能风险及数据缺口，体检只作基线背景；第四部分写下一周期可执行计划，注明事项、频次、责任角色和复评时间。每栏最多6条，每条先写简短判断标签，再用冒号补充依据。`;
  const content = await chat([{ role: 'user', content: prompt }], { provider: 'qwen', systemPrompt: '只基于提供资料评估，不能补造事实。', maxTokens: 1400, temperature: 0.05, timeoutMs: 90000 });
  return PhaseAssessment.create({
    patientId: user._id, annualPlanId: plan._id, templateId: template._id,
    periodKey: period.key, periodLabel: period.label, content,
    evidenceSources: context.sources || [], templateSnapshot: { name: template.name, frequency, windowDays, focus, instructions, minimumData, outputSections, triggerRule: template.content?.triggerRule || '' },
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
  if (process.env.ENABLE_PHASE_ASSESSMENT_SCHEDULER !== 'true') {
    console.log('[phase-assessment] automatic scheduler disabled; manual pilot only');
    return;
  }
  scanAndCreatePhaseAssessments().catch(error => console.error('[phase-assessment] initial scan failed', error.message));
  // 每小时检查一次；periodKey 唯一索引保证同一客户/模板/周期不会重复生成。
  setInterval(() => scanAndCreatePhaseAssessments().catch(error => console.error('[phase-assessment] scan failed', error.message)), 60 * 60 * 1000);
}

module.exports = { createAssessment, scanAndCreatePhaseAssessments, startPhaseAssessmentScheduler };
