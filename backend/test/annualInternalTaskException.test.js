const test = require('node:test');
const assert = require('node:assert/strict');
const { eligible, serviceReleased } = require('../src/utils/annualInternalTaskException');

const plan = {
  _id: '6ac6169e07e2feec6321fb77', patientId: '6a4f3531962a3b13144af513',
  year: 2026, pushedAt: new Date('2026-10-08'), reviewStatus: 'approved', confirmedAt: null,
};

test('only the named published unconfirmed plan can start internal work', () => {
  assert.equal(eligible(plan), true);
  assert.equal(eligible({ ...plan, patientId: 'another' }), false);
  assert.equal(eligible({ ...plan, _id: 'another' }), false);
  assert.equal(eligible({ ...plan, pushedAt: null }), false);
  assert.equal(eligible({ ...plan, confirmedAt: new Date() }), false);
  assert.equal(eligible({ ...plan, continuitySource: { previousPlanId: 'old' } }), false);
});

test('service bypass requires both explicit staff release markers', () => {
  assert.equal(serviceReleased({ ...plan, followUpReleasedAt: new Date() }), false);
  assert.equal(serviceReleased({ ...plan, serviceTaskReleasedAt: new Date() }), false);
  assert.equal(serviceReleased({ ...plan, followUpReleasedAt: new Date(), serviceTaskReleasedAt: new Date() }), true);
});
