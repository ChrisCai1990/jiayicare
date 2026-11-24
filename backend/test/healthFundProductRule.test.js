const test = require('node:test');
const assert = require('node:assert/strict');
const { productDeductionLimit, allocateHealthFund } = require('../src/utils/healthFundPayment');
const { validateProductFundRule, resolveProductFundRule } = require('../src/utils/productFundRule');

test('each charge specification resolves its own gift fund percentage', () => {
  const product = { healthFundDeduction:{mode:'percentage',value:5}, servicePrices:[
    {label:'代配药',price:280,healthFundDeduction:{mode:'percentage',value:3}},
    {label:'代约检（常规）',price:380,healthFundDeduction:{mode:'percentage',value:10}},
    {label:'代约检（特殊）',price:480,healthFundDeduction:{mode:'disabled',value:0}},
  ] };
  assert.equal(productDeductionLimit(resolveProductFundRule(product,'代配药'),280),8.4);
  assert.equal(productDeductionLimit(resolveProductFundRule(product,'代约检（常规）'),380),38);
  assert.equal(productDeductionLimit(resolveProductFundRule(product,'代约检（特殊）'),480),0);
  assert.equal(resolveProductFundRule(product,'不存在'),null);
});
test('explicit product rules allow 5, 30 and 100 percent without a platform cap', () => {
  for (const value of [5,30,100]) assert.equal(productDeductionLimit({mode:'percentage',value},500),500*value/100);
  assert.equal(productDeductionLimit({mode:'disabled'},500),0);
});
test('unconfigured and legacy product rules have no gift fund allowance', () => {
  for (const rule of [undefined,{mode:'inherit'},{mode:'unlimited'},{mode:'fixedAmount',value:100}]) assert.equal(productDeductionLimit(rule,500),0);
});
test('corporate source keeps its product cap after personal funds, without exceeding the order', () => {
  assert.deepEqual(allocateHealthFund({orderAmount:500,personalAvailable:50,corporateAvailable:600,productRule:{mode:'percentage',value:30}}),{personalUsed:50,vitalityUsed:0,corporateUsed:150,allowed:200});
  assert.equal(allocateHealthFund({orderAmount:500,personalAvailable:10,corporateAvailable:20,productRule:{mode:'percentage',value:100}}).allowed,30);
});
test('save validation rejects invalid percentages instead of silently clamping', () => {
  for (const value of [0,-1,101,'bad',Infinity]) assert.ok(validateProductFundRule({mode:'percentage',value}));
  for (const value of [1,5,30,100]) assert.equal(validateProductFundRule({mode:'percentage',value}),null);
  assert.ok(validateProductFundRule({mode:'bogus'}));
  assert.ok(validateProductFundRule(undefined));
  assert.ok(validateProductFundRule({mode:'inherit'}));
});
