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


const { dentalDrafts, selectCatalogOptions, customerRecommendation } = require('../src/utils/annualServiceRecommendation');
const dentalReport = (findings, extra = {}) => ({title:'体检报告', audit_status:'audited', reportYear:2026, checkDate:'2026-09-01', reportItems:[{name:'口腔', findings}], ...extra});
test('年度已审牙结石直接带入洁牙草稿，保留依据和方式待定，不重复已保存建议', () => {
  const rows=dentalDrafts([dentalReport('牙结石')],2026);
  assert.equal(rows[0].recommendation,'洁牙服务');assert.match(rows[0].evidence,/2026-09-01.*牙结石/);
  assert.match(rows[0].nextStep,/具体洁牙方式/);assert.deepEqual(rows[0].selectedOptions,[]);
  assert.deepEqual(dentalDrafts([dentalReport('牙结石')],2026,rows),[]);
  assert.deepEqual(dentalDrafts([dentalReport('牙结石',{audit_status:'pending'})],2026),[]);
  assert.deepEqual(dentalDrafts([dentalReport('牙结石',{reportYear:2025})],2026),[]);
});
test('正常、疑似及既往已处理牙结石不自动带入洁牙建议', () => {
  for(const text of ['未见牙结石','未发现明显牙结石','无明显牙结石','无牙结石','牙结石已清除','疑似牙结石','既往牙结石']) assert.deepEqual(dentalDrafts([dentalReport(text)],2026),[]);
});
test('机构套餐只接受目录ID，忽略伪造名称价格，停用或跨目录引用拒绝', () => {
  const catalog=[{type:'product',id:'p',name:'洁牙套餐',price:100,address:'服务地点'}];
  const options=selectCatalogOptions([{type:'product',id:'p',price:1,name:'伪造'}],catalog);
  assert.equal(options[0].price,100);assert.equal(options[0].name,'洁牙套餐');
  assert.throws(()=>selectCatalogOptions([{type:'product',id:'other'}],catalog),/不可用/);
  assert.throws(()=>selectCatalogOptions([{type:'institution',id:'p'}],catalog),/不可用/);
  assert.throws(()=>selectCatalogOptions([{type:'product',id:'p'},{type:'product',id:'p'}],catalog),/不可用/);
  const customer=customerRecommendation({nextStep:'具体方式由医生确定',selectedOptions:options});
  assert.match(customer.nextStep,/洁牙套餐.*100/);assert.match(customer.nextStep,/实际价格以确认时为准/);
});
