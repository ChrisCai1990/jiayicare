const test = require('node:test');
const assert = require('node:assert/strict');
const { released } = require('../src/utils/annualFollowUpEarlyRelease');

const plan = { reviewStatus: 'approved', pushedAt: new Date('2026-10-02') };

test('only a published annual plan explicitly released for follow-ups may bypass confirmation', () => {
  assert.equal(released(plan), false);
  assert.equal(released({ ...plan, followUpReleasedAt: plan.pushedAt }), true);
  assert.equal(released({ ...plan, followUpReleasedAt: plan.pushedAt, reviewStatus: 'rejected' }), false);
  assert.equal(released({ ...plan, followUpReleasedAt: plan.pushedAt, pushedAt: null }), false);
  assert.equal(released({ ...plan, followUpReleasedAt: plan.pushedAt, continuitySource: { previousPlanId: 'old' } }), false);
});
