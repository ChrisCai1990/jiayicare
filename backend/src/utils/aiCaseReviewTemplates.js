const PlanTemplate = require('../models/PlanTemplate');

const DEFAULT_SCOPES = ['basic', 'healthProfile', 'reports', 'healthRecords', 'medications', 'followups', 'plans', 'aiAnalysis'];
const DEFAULT_TEMPLATES = [
  ['checkup', '体检方案研判', '结合体检报告、健康档案和既往检查，明确本次体检重点与待审核方案。', ['basic','healthProfile','reports','plans','aiAnalysis'], '本次体检方案', '研判依据、体检重点、风险或资料缺口、待审核方案'],
  ['nutrition', '营养干预研判', '结合指标、生活方式和依从性讨论本季度营养干预方向，形成季度待审核方案。', ['basic','healthProfile','healthRecords','medications','followups','plans'], '季度营养干预方案', '研判依据、营养问题、执行情况、风险或资料缺口、季度待审核方案'],
  ['annual', '年度管理研判', '结合健康档案、目标和既有服务，讨论下一年度管理重点与待审核方案。', ['basic','healthProfile','reports','healthRecords','followups','plans','aiAnalysis'], '年度管理方案', '年度变化、管理重点、风险或资料缺口、年度待审核方案'],
  ['medical', '就医协助研判', '围绕明确健康问题讨论本次复查、就医或陪诊安排，形成单次待审核方案。', ['basic','healthProfile','reports','plans','aiAnalysis'], '单次就医协助方案', '就医问题、已确认事实、待补资料、单次就医协助安排'],
  ['daily', '日常问题交流', '围绕具体问题进行信息分析和讨论；仅保存讨论结论，不自动生成方案。', ['basic','healthProfile','reports','healthRecords','medications','followups'], '讨论结论', '问题要点、已确认事实、待补信息、人工决定的后续事项'],
  ['specialty', '专病分析', '围绕某一明确疾病，纵向汇总病史、检查、治疗、用药和随访变化，识别证据缺口并形成待专业人员复核的分析结论。', DEFAULT_SCOPES, '专病分析结论', '疾病概况、时间轴、关键指标与影像变化、治疗及用药、风险与矛盾点、待补资料、下一步建议'],
];

async function ensureAiCaseReviewTemplates() {
  const legacySpecialty = await PlanTemplate.findOne({ type: 'ai_case_review', name: '专病分析', 'content.templateKey': { $exists: false }, 'content.kind': { $ne: 'settings' } });
  if (legacySpecialty) {
    legacySpecialty.content = { ...legacySpecialty.content, templateKey: 'specialty', title: legacySpecialty.content?.title || legacySpecialty.name, sortOrder: legacySpecialty.content?.sortOrder ?? 5 };
    await legacySpecialty.save();
  }
  await Promise.all(DEFAULT_TEMPLATES.map(([templateKey, name, description, contextScopes, target, outputGuide], sortOrder) => PlanTemplate.findOneAndUpdate(
    { type: 'ai_case_review', 'content.templateKey': templateKey },
    { $setOnInsert: { type: 'ai_case_review', name, status: 'active', content: { templateKey, title: name, description, contextScopes, target, outputGuide, sortOrder } } },
    { upsert: true, setDefaultsOnInsert: true },
  )));
  await PlanTemplate.findOneAndUpdate(
    { type: 'ai_case_review', 'content.kind': 'settings' },
    { $setOnInsert: { type: 'ai_case_review', name: '专项研判全局设置', status: 'active', content: { kind: 'settings', allowCustomTopic: true } } },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

module.exports = { DEFAULT_SCOPES, ensureAiCaseReviewTemplates };
