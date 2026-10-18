const test = require('node:test');
const assert = require('node:assert/strict');
const { belongsInServiceProgress } = require('../src/utils/serviceSupervisionEligibility');

test('a plan without execution tasks is not a service progress', () => {
  assert.equal(belongsInServiceProgress({ type: 'plan', tasks: [] }), false);
  assert.equal(belongsInServiceProgress({ type: 'plan', tasks: [{ status: 'planned' }] }), true);
});

test('a standalone annual reminder is not a service progress', () => {
  const reminder = { sourceAnnualPlanId: 'annual', sourceType: 'scheduled', deliveryMode: 'reminder' };
  assert.equal(belongsInServiceProgress({ type: 'followup', tasks: [reminder] }), false);
  assert.equal(belongsInServiceProgress({ type: 'followup', tasks: [reminder, { ...reminder }] }), false);
  assert.equal(belongsInServiceProgress({ type: 'followup', tasks: [reminder, { sourceType: 'annual_service' }] }), true);
});

test('an AI monthly review task is not an order service', () => {
  assert.equal(belongsInServiceProgress({ type: 'followup', tasks: [{ sourceType: 'ai_review' }] }), false);
  assert.equal(belongsInServiceProgress({ type: 'followup', tasks: [{ sourceType: 'order' }] }), true);
});

test('actual service flows and managed annual tasks remain visible', () => {
  assert.equal(belongsInServiceProgress({ type: 'order', tasks: [] }), true);
  assert.equal(belongsInServiceProgress({ type: 'flow', tasks: [] }), true);
  assert.equal(belongsInServiceProgress({ type: 'followup', tasks: [
    { sourceAnnualPlanId: 'annual', sourceType: 'scheduled', deliveryMode: 'managed' },
  ] }), true);
});
