const test = require('node:test');
const assert = require('node:assert/strict');
const { createPreparationCompletion } = require('../src/utils/checkupPreparationCompletion');
const task = { status: 'completed', outcomeReview: { decision: 'no_further' }, patientId: 'p',
  sourceType: 'scheduled', sourceAnnualPlanId: 'annual', sourceScheduleKey: 'annual_checkup:2026-09-29' };
function setup(planners = [{ _id: 'planner' }], links = [{ _id: 'link', status: 'active', servicePlanId: 'service' }]) {
  const calls = [];
  const runtime = createPreparationCompletion({
    FollowUp: { find: q => { calls.push(['planner', q]); return { lean: async () => planners }; } },
    Handoff: { find: q => { calls.push(['handoff', q]); return { lean: async () => links }; } },
    // An absent service must not cause any synthetic completion writes.
    HealthPlan: { findById: id => { calls.push(['service', id]); return { lean: async () => null }; } },
  });
  return { runtime, calls };
}
test('only reviewed completed scheduled annual checkups select a handoff', async () => {
  for (const patch of [{ status: 'in_progress' }, { outcomeReview: null }, { sourceType: 'health_plan' },
    { sourceAnnualPlanId: null }, { sourceScheduleKey: 'annual_checkup:2026-09-29:prepare:healthPlanner' }]) {
    const { runtime, calls } = setup();
    assert.equal(await runtime.forOriginal({ ...task, ...patch }), false);
    assert.equal(calls.length, 0);
  }
});
test('exact customer/year/slot maps to exactly one service and keeps existing guards', async () => {
  const { runtime, calls } = setup();
  assert.equal(await runtime.forOriginal(task), false);
  assert.deepEqual(calls, [
    ['planner', { patientId: 'p', sourceAnnualPlanId: 'annual', sourceType: 'annual_service', sourceScheduleKey: 'annual_checkup:2026-09-29:prepare:healthPlanner' }],
    ['handoff', { patientId: 'p', annualPlanId: 'annual', plannerTaskId: 'planner', status: 'active' }], ['service', 'service'],
  ]);
});
test('missing or ambiguous source never guesses another service', async () => {
  for (const [planners, links] of [[[], []], [[{ _id: 'a' }, { _id: 'b' }], []], [[{ _id: 'a' }], []],
    [[{ _id: 'a' }], [{ _id: 'a' }, { _id: 'b' }]]]) {
    const { runtime, calls } = setup(planners, links);
    assert.equal(await runtime.forOriginal(task), false);
    assert.equal(calls.some(c => c[0] === 'service'), false);
  }
});
