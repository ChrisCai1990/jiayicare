const test = require('node:test');
const assert = require('node:assert/strict');
const { productDeductionLimit, allocateHealthFund } = require('../src/utils/healthFundPayment');
const { validateProductFundRule } = require('../src/utils/productFundRule');
test('explicit product rules allow 5, 30 and 100 percent without a platform cap', () => {
  for (const value of [5,30,100]) assert.equal(productDeductionLimit({mode:'percentage',value},500),500*value/100);
  assert.equal(productDeductionLimit({mode:'disabled'},500),0);
  assert.equal(productDeductionLimit({mode:'fixedAmount',value:150},500),150);
  assert.equal(productDeductionLimit({mode:'fixedAmount',value:1000},500),500);
});
test('existing inherited and legacy unlimited rules keep their previous allowance', () => {
  for (const rule of [undefined,{mode:'inherit'},{mode:'unlimited'}]) assert.equal(productDeductionLimit(rule,500),100);
});
test('fund sources share one product cap and cannot exceed balance or order', () => {
  assert.deepEqual(allocateHealthFund({orderAmount:500,personalAvailable:50,corporateAvailable:600,productRule:{mode:'percentage',value:30}}),{personalUsed:50,corporateUsed:100,allowed:150});
  assert.equal(allocateHealthFund({orderAmount:500,personalAvailable:10,corporateAvailable:20,productRule:{mode:'percentage',value:100}}).allowed,30);
});
test('save validation rejects invalid percentages instead of silently clamping', () => {
  for (const value of [0,-1,101,'bad',Infinity]) assert.ok(validateProductFundRule({mode:'percentage',value}));
  for (const value of [1,5,30,100]) assert.equal(validateProductFundRule({mode:'percentage',value}),null);
  assert.ok(validateProductFundRule({mode:'bogus'}));
});
