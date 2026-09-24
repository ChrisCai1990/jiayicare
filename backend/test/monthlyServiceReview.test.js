const test = require('node:test');
const assert = require('node:assert/strict');
const { shanghaiMonth, inPlanWindow, dueMonths } = require('../src/utils/monthlyServiceReview');
const reviewRollout = require('../src/utils/monthlyReviewRollout');
const pilotId = '507f1f77bcf86cd799439011';
const otherId = '507f1f77bcf86cd799439012';

test('monthly review uses Shanghai calendar around UTC month boundary', () => {
  assert.equal(shanghaiMonth(new Date('2026-09-30T16:01:00Z')), '2026-10');
  assert.equal(shanghaiMonth(new Date('2026-09-30T15:59:00Z')), '2026-09');
});

test('only confirmed plan months within first service year are selectable', () => {
  const plan = { confirmedAt: new Date('2026-09-22T00:00:00Z') };
  const now = new Date('2027-09-25T00:00:00Z');
  assert.equal(inPlanWindow(plan, '2026-08', now), false);
  assert.equal(inPlanWindow(plan, '2026-09', now), true);
  assert.equal(inPlanWindow(plan, '2027-08', now), true);
  assert.equal(inPlanWindow(plan, '2027-09', now), false);
  assert.equal(inPlanWindow(plan, 'not-a-month', now), false);
  assert.equal(inPlanWindow({}, '2026-09', now), false);
});

test('workbench month is due from 25th Shanghai time; earlier months remain due', () => {
  const plan = { confirmedAt: new Date('2026-09-02T00:00:00Z') };
  assert.deepEqual(dueMonths(plan, new Date('2026-09-23T00:00:00Z')), []);
  assert.deepEqual(dueMonths(plan, new Date('2026-09-24T16:00:00Z')), ['2026-09']);
  assert.deepEqual(dueMonths(plan, new Date('2026-10-03T00:00:00Z')), ['2026-09']);
});

test('monthly review has separate patient allowlist on top of health management', () => {
  const env = { NODE_ENV: 'production', HEALTH_MANAGEMENT_ROLLOUT_MODE: 'allowlist', HEALTH_MANAGEMENT_PATIENT_IDS: `${pilotId},${otherId}`, MONTHLY_REVIEW_ROLLOUT_MODE: 'allowlist', MONTHLY_REVIEW_PATIENT_IDS: pilotId };
  assert.equal(reviewRollout.enabledForPatient(pilotId, env), true);
  assert.equal(reviewRollout.enabledForPatient(otherId, env), false);
  assert.deepEqual(reviewRollout.patientFilter('patientId', env), { patientId: { $in: [pilotId] } });
  assert.equal(reviewRollout.enabledForPatient(pilotId, { ...env, MONTHLY_REVIEW_ROLLOUT_MODE: 'disabled' }), false);
  assert.equal(reviewRollout.enabledForPatient(pilotId, { NODE_ENV: 'production', HEALTH_MANAGEMENT_ROLLOUT_MODE: 'all' }), false);
});
