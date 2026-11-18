const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnnualPlanDisplayItems, customerModuleData } = require('../src/utils/annualPlanPresentation');

test('年度方案生成统一的客户展示卡片字段', () => {
  const items = buildAnnualPlanDisplayItems({ abnormal_followup: { records: [{
    items: '血脂复查', reason: '低密度脂蛋白升高', basisSummary: '2026-05-20体检报告', time: '2026-11-20',
    frequency: '单次', customerAction: '空腹完成复查', serviceMode: 'single', serviceType: 'proxy_booking', department: '心内科',
  }] } });
  assert.equal(items.length, 1);
  assert.equal(items[0].category, '需要定期复查');
  assert.equal(items[0].evidence, '2026-05-20体检报告');
  assert.equal(items[0].service.modeLabel, '单项服务');
  assert.equal(items[0].service.typeLabel, '代约/代办');
});

test('内部备注不会进入客户展示结构', () => {
  const [item] = buildAnnualPlanDisplayItems({ vaccine: { records: [{ name: '流感疫苗', notes: '内部沟通记录' }] } });
  assert.equal(Object.values(item).includes('内部沟通记录'), false);
});

test('客户方案不返回内部研判依据和编号，仍保留行动目标', () => {
  const source = { nutrition_assessment: { records: [{
    items: '营养师专项评估', reason: '内部研判 (topicId:secret)',
    basisSummary: '设置依据 (topicId:secret)', personalizedAdvice: '营养师内部处置建议',
    goal: '核实膳食和体成分情况', time: '2026-12-01',
  }] } };
  const publicData = customerModuleData(source);
  const displayItems = buildAnnualPlanDisplayItems(publicData);
  assert.equal(displayItems.length, 1);
  const item = displayItems[0];
  assert.equal(JSON.stringify({ publicData, item }).includes('topicId'), false);
  assert.equal(JSON.stringify({ publicData, item }).includes('内部处置建议'), false);
  assert.equal(item.goal, '核实膳食与体成分情况');
  assert.equal(item.schedule, '2026-12-01');
});

test('已移除的年度营养评估不进入客户完整方案', () => {
  const moduleData = { nutrition_assessment: { enabled: false, records: [{ items: '不再重复评估' }] } };
  assert.deepEqual(buildAnnualPlanDisplayItems(moduleData), []);
  assert.equal(customerModuleData(moduleData).nutrition_assessment, undefined);
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
