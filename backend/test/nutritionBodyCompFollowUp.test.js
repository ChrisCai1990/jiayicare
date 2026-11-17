const test = require('node:test');
const assert = require('node:assert/strict');
const { addDays, dateOnly, taskKey, taskDocument, ensureTask, measurementOptions } = require('../src/utils/nutritionBodyCompFollowUp');

test('first body composition invitation is three days before day 28 and retries reuse the same cycle', async () => {
  const plan = { _id: 'plan-1', patientId: 'patient-1', staffId: 'nutritionist-1' };
  const patient = { assignedNutritionist: 'nutritionist-1' };
  const target = addDays(new Date('2026-11-17T02:00:00Z'), 28);
  assert.equal(target.toISOString().slice(0, 10), '2026-12-15');
  const first = taskDocument(plan, patient, 1, target);
  assert.equal(first.date.toISOString().slice(0, 10), '2026-12-12');
  assert.equal(first.bodyCompCycle.targetAt.toISOString().slice(0, 10), '2026-12-15');
  assert.equal(first.assessmentActionKey, taskKey(plan._id, 1));
  const saved = new Map();
  const FollowUp = { findOneAndUpdate: async (filter, update) => {
    if (!saved.has(filter.assessmentActionKey)) saved.set(filter.assessmentActionKey, update.$setOnInsert);
    return saved.get(filter.assessmentActionKey);
  } };
  const a = await ensureTask(FollowUp, plan, patient, 1, target);
  const b = await ensureTask(FollowUp, plan, patient, 1, addDays(target, 7));
  assert.equal(a, b);
  assert.equal(saved.size, 1);
});

test('only dated archived measurements after the previous cycle are selectable', () => {
  const patient = { bodyCompHistory: [
    { measuredAt: '2026-11-01', bodyFatRate: 25 },
    { measuredAt: '2026-11-20', note: '未测量' },
    { measuredAt: '2026-11-22', bodyFatRate: '24.8', source: 'medical_report', sourceReportId: 'report-1' },
  ] };
  assert.deepEqual(measurementOptions(patient, '2026-11-17').map(row => row.index), [2]);
  assert.deepEqual(measurementOptions(patient, '2026-11-23'), []);
  assert.equal(dateOnly('2026-02-31'), null);
});
