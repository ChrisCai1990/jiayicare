const test = require('node:test');
const assert = require('node:assert/strict');
const { teamIncentiveCents } = require('../src/utils/teamIncentivePolicy');

test('product-specific three roles can use different rate and fixed amount rules', () => {
  const basisCents = 1280000;
  assert.equal(teamIncentiveCents({ role: 'familyDoctor', ruleType: 'percentage', basisCents, basisPoints: 300 }), 38400);
  assert.equal(teamIncentiveCents({ role: 'nutritionist', ruleType: 'fixedAmount', basisCents, amountCents: 50000 }), 50000);
  assert.equal(teamIncentiveCents({ role: 'healthManager', ruleType: 'percentage', basisCents, basisPoints: 200, capCents: 20000 }), 20000);
});

test('unknown clinical or sales role cannot be paid by the three-role rule', () => {
  assert.throws(() => teamIncentiveCents({ role: 'medicalAssistant', ruleType: 'fixedAmount', basisCents: 10000, amountCents: 1000 }));
});
