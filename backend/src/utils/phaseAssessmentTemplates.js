const PlanTemplate = require('../models/PlanTemplate');

const DRAFTS = [
  {
    name: '月度阶段性健康评估（待审核模板）',
    content: {
      frequency: 'monthly',
      focus: '本月健康监测、体重/血压/血糖等目标指标变化、方案执行与随访完成情况、异常信号和复查进度。',
      instructions: '对比本月与上月可用数据；数据不足必须明确列出；不得诊断、开药、自动调整或发布方案。输出只供健康顾问审核。',
      contextScopes: ['healthProfile', 'reports', 'healthRecords', 'followups', 'plans'],
    },
  },
  {
    name: '季度阶段性健康评估（待审核模板）',
    content: {
      frequency: 'quarterly',
      focus: '本季度目标达成、关键指标趋势、体检/复查结果、日常健康数据、方案依从性、风险变化和下一季度待讨论事项。',
      instructions: '必须区分已确认数据与分析判断；指出与既定目标或当前方案不一致之处；只提出待讨论的调整方向，不自动修改方案或生成医疗结论。',
      contextScopes: ['healthProfile', 'reports', 'healthRecords', 'followups', 'plans', 'aiAnalysis'],
    },
  },
];

async function ensurePhaseAssessmentTemplateDrafts() {
  for (const draft of DRAFTS) {
    await PlanTemplate.updateOne(
      { type: 'phase_assessment', name: draft.name, clientBrand: '' },
      { $setOnInsert: { ...draft, type: 'phase_assessment', clientBrand: '', status: 'inactive' } },
      { upsert: true }
    );
  }
}

module.exports = { ensurePhaseAssessmentTemplateDrafts };
