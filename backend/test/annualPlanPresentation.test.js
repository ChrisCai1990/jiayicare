const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnnualPlanDisplayItems } = require('../src/utils/annualPlanPresentation');

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
