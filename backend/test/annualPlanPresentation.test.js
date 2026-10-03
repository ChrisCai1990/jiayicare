const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnnualPlanDisplayItems, customerModuleData } = require('../src/utils/annualPlanPresentation');

test('年度方案生成统一的客户展示卡片字段', () => {
  const items = buildAnnualPlanDisplayItems({ abnormal_followup: { records: [{
    items: '血脂复查', reason: '低密度脂蛋白升高', basisSummary: '2026-05-20体检报告', time: '2026-11-20',
    frequency: '单次', customerAction: '空腹完成复查', serviceMode: 'single', serviceType: 'proxy_booking', department: '心内科',
  }] } });
  assert.equal(items.length, 1);
  assert.equal(items[0].category, '定期复查');
  assert.equal(items[0].evidence, '2026-05-20体检报告');
  assert.equal(items[0].service.modeLabel, '单项服务');
  assert.equal(items[0].service.typeLabel, '代约/代办');
});

test('内部备注不会进入客户展示结构', () => {
  const [item] = buildAnnualPlanDisplayItems({ vaccine: { records: [{ name: '流感疫苗', notes: '内部沟通记录' }] } });
  assert.equal(Object.values(item).includes('内部沟通记录'), false);
});

test('家庭医生年度目标和完成标准进入客户年度方案', () => {
  const [item] = buildAnnualPlanDisplayItems({ medical_treatment: { records: [{
    reason: '需明确问题', purpose: '专科评估', goal: '明确后续管理方向',
    completionStandard: '回收专科意见并由健康顾问确认下一步',
  }] } });
  assert.equal(item.goal, '明确后续管理方向');
  assert.equal(item.completionStandard, '回收专科意见并由健康顾问确认下一步');
});

test('已确认研判目标以目标和干预重点展示，内部研判来源不外显', () => {
  const source = { management_targets: { enabled: true, records: [{
    goal: '改善空腹血糖', focus: '核实餐次与主食分配', nutritionRelevant: true,
    sourceReviewId: 'internal-id', sourceTitle: '代谢专项研判', sourceGoal: '改善空腹血糖',
  }] } };
  const [item] = buildAnnualPlanDisplayItems(source);
  assert.equal(item.category, '年度管理目标');
  assert.equal(item.goal, '改善空腹血糖');
  assert.equal(item.interventionFocus, '核实餐次与主食分配');
  assert.equal(customerModuleData(source).management_targets.records[0].sourceReviewId, undefined);
});
