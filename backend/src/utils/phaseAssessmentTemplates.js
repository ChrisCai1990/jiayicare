const PlanTemplate = require('../models/PlanTemplate');

const DRAFTS = [
  {
    name: '月度阶段性健康评估（待审核模板）',
    content: {
      frequency: 'monthly',
      triggerRule: '年度管理方案确认后，按自然月生成；同一客户、同一年度方案、同一模板每月最多一份。',
      minimumData: '至少核对本月健康记录、随访记录和服务方案；缺失时不得推断，改列为待补数据。',
      focus: '本月健康监测、目标指标变化、服务方案执行与随访完成情况、异常信号和复查进度。重点识别影响管理落地的执行偏差。',
      instructions: '对比本月与上月可用数据；分别写明已确认事实、AI分析和待人工确认事项。不得诊断、开药、自动调整或发布方案。输出只供健康顾问审核。',
      outputSections: ['本期目标与已确认数据', '管理执行与依从性', '成效、异常与数据缺口', '下月待审核行动计划'],
      contextScopes: ['healthProfile', 'reports', 'healthRecords', 'followups', 'plans'],
    },
  },
  {
    name: '季度阶段性健康评估（待审核模板）',
    content: {
      frequency: 'quarterly',
      triggerRule: '年度管理方案确认后，按自然季度生成；用于评估管理措施是否有效，而非重复月度摘要。',
      minimumData: '至少核对本季度健康记录、随访/服务执行、检查或复查资料和既定方案目标；不足项须明确。',
      focus: '本季度目标达成、关键指标趋势、体检/复查结果、日常健康数据、方案依从性、风险变化；分析管理措施与结果之间的可见关联及未达成原因线索。',
      instructions: '必须区分已确认数据与分析判断；指出与既定目标或当前方案不一致之处；下一季度只提出待讨论的调整方向，不自动修改方案或生成医疗结论。',
      outputSections: ['季度目标与证据汇总', '方案执行、依从性与阶段成效', '未达成事项、风险和数据缺口', '下季度待审核计划'],
      contextScopes: ['healthProfile', 'reports', 'healthRecords', 'followups', 'plans', 'aiAnalysis'],
    },
  },
  {
    name: '年度健康管理总结与下一年度计划（待审核模板）',
    content: {
      frequency: 'yearly',
      triggerRule: '以年度管理方案确认日为起算点，满 12 个月后生成；此后每满 12 个月生成一次，不按元旦机械触发。',
      minimumData: '至少核对全年目标、服务方案、随访记录、健康数据和检查/复查资料；数据不足时必须列为续管前待补项。',
      focus: '回顾全年健康管理目标、服务方案执行与依从性、关键健康指标和体检/复查趋势、阶段性改善与未达成事项、风险变化；结合全年资料梳理下一年度管理优先级与待确认计划。',
      instructions: '必须以既有年度管理目标和服务方案为基线，区分已确认数据、阶段结论与待讨论判断；说明管理措施是否执行、效果如何及原因线索；下一年度仅提出供家庭医生/健康顾问确认的目标、随访节奏、复查或服务调整方向。不得诊断、开药、自动创建、调整或发布正式方案。',
      outputSections: ['年度管理目标与证据汇总', '全年执行、依从性与管理成效', '未达成原因、风险和续管前数据缺口', '下一年度待审核续管计划'],
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
    // 只升级仍为“停用”的系统草稿；已启用模板一律由管理员控制，绝不被启动程序覆盖。
    await PlanTemplate.updateOne(
      { type: 'phase_assessment', name: draft.name, clientBrand: '', status: 'inactive' },
      { $set: { content: draft.content } }
    );
  }
}

module.exports = { ensurePhaseAssessmentTemplateDrafts };
