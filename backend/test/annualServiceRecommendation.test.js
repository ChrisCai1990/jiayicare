const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRecommendationInput } = require('../src/utils/annualServiceRecommendation');
const { buildAnnualPlanServiceTasks } = require('../src/utils/annualPlanServiceTasks');

test('服务建议要求事实依据，不接受直接下单字段', () => {
  const row = normalizeRecommendationInput({ finding: ' 发现牙结石 ', evidence: '口腔检查记录', recommendation: '口腔科评估是否需要洁牙', timeframe: '近期', serviceMode: 'managed' });
  assert.equal(row.finding, '发现牙结石');
  assert.equal(row.recommendation, '口腔科评估是否需要洁牙');
  assert.equal(row.serviceMode, undefined);
  assert.throws(() => normalizeRecommendationInput({ finding: '牙结石', recommendation: '洁牙' }), /客观依据/);
  assert.throws(() => normalizeRecommendationInput({ finding: 'x'.repeat(301), evidence: '记录', recommendation: '评估' }), /300/);
});

test('服务建议不是年度执行模块，不生成规划师服务需求任务', () => {
  const plan = { confirmedAt: new Date(), moduleData: { service_recommendations: { records: [{ finding: '牙结石', evidence: '记录', recommendation: '口腔科评估', serviceMode: 'managed' }] } } };
  assert.deepEqual(buildAnnualPlanServiceTasks(plan, { assignedHealthPlanner: 'planner' }), []);
});
