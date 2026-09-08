const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateAttribution } = require('../src/utils/commissionAttribution');
test('referral reassignment uses new personal rate then product fallback', () => {
 const c = { role: 'referrer', orderAmount: 359 };
 assert.equal(calculateAttribution(c, { personalPerformanceRule: { ruleType: 'percentage', referrerRate: 20 } }, { ruleType: 'none' }).commissionAmount, 71.8);
 assert.equal(calculateAttribution(c, {}, { ruleType: 'percentage', referrerRate: 5 }).commissionAmount, 17.95);
 assert.equal(calculateAttribution(c, {}, { ruleType: 'none' }).commissionAmount, 0);
 assert.equal(calculateAttribution(c, {}, { ruleType: 'fixedAmount', referrerAmount: 30 }).commissionAmount, 30);
});
test('service reassignment preserves the original redemption calculation', () => {
 assert.deepEqual(calculateAttribution({ role: 'fulfiller', commissionAmount: 50, commissionRate: 0.1 }, {}, {}), { commissionAmount: 50, commissionRate: 0.1 });
});
