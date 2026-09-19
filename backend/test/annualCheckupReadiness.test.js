const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAnnualCheckupPreparation } = require('../src/utils/annualCheckupPreparation');
const { evaluateReadiness, loadReadiness } = require('../src/utils/checkupPreparationReadiness');
function fixture() {
  const annual = { _id: 'annual', patientId: 'patient', confirmedAt: '2026-09-01', pushedAt: '2026-08-31', reviewStatus: 'approved',
    moduleData: { annual_checkup: { enabled: true, date: '2026-10-03' } } };
  const patient = { _id: 'patient', assignedFamilyDoctor: 'advisor', assignedHealthPlanner: 'planner' };
  const now = '2026-09-19T10:00:00+08:00';
  const gate = { allowed: true, anchor: annual.confirmedAt, access: { active: true, startDate: '2026-09-01', endDate: '2027-08-31' } };
  const tasks = buildAnnualCheckupPreparation(annual, patient, gate, now).tasks.map((row, i) => ({ ...row, _id: `task${i}`, status: 'completed', completedAt: now }));
  tasks[0].formData.annualCheckupPreparation.evidence = { healthPlanId: 'plan' };
  tasks[1].formData.annualCheckupPreparation.evidence = { date: '2026-10-03', institution: '机构', note: '时间和资源已沟通',
    customerConfirmed: true, resourceConfirmed: true, recordedBy: 'planner', recordedAt: now };
  const plan = { _id: 'plan', patientId: 'patient', preparationTaskId: 'task0', type: 'annual_checkup', status: 'active',
    createdAt: '2026-09-02', pushedAt: '2026-09-18', confirmedAt: now,
    content: { annualPlanId: 'annual', targetCheckupDate: '2026-10-03', aiStatus: 'approved', reviewedBy: 'advisor', reviewedAt: '2026-09-18' } };
  return { annual, patient, gate, tasks, plan, now };
}
const evaluate = data => evaluateReadiness(data);

test('valid dual-role evidence converges without mutating data or claiming service started', () => {
  const data = fixture(); const before = JSON.stringify(data); const result = evaluate(data);
  assert.equal(result.state, 'ready_for_service_link'); assert.equal(result.readyForServiceLink, true);
  assert.equal(result.serviceStarted, false); assert.equal(result.resources.institution, '机构');
  assert.equal(JSON.stringify(data), before);
});
test('expired, future or revoked service gates block handoff', () => {
  for (const gate of [{ allowed: false, reason: '凭据失效' }, { allowed: true, access: { active: false } }]) {
    assert.equal(evaluate({ ...fixture(), gate }).readyForServiceLink, false);
  }
});
test('missing and duplicate role tasks never infer successful preparation', () => {
  const data = fixture(); data.tasks.pop(); assert.equal(evaluate(data).issues[0].code, 'missing_preparation');
  data.tasks.push(structuredClone(data.tasks[0])); assert.equal(evaluate(data).issues[0].code, 'duplicate_preparation');
});
test('completed task with invalid, withdrawn or unpublished plan is not ready', () => {
  for (const patch of [{ status: 'draft' }, { pushedAt: null }, { preparationTaskId: 'old' }, { patientId: 'other' }, { _id: 'other' }]) {
    const data = fixture(); Object.assign(data.plan, patch);
    assert.equal(evaluate(data).issues[0].code, 'plan_not_current');
  }
});
test('legacy unmarked plan cannot unlock independent preparation service', () => {
  const data = fixture(); delete data.plan.preparationTaskId;
  assert.equal(evaluate(data).readyForServiceLink, false);
});
test('missing, stale or future customer confirmation leaves planner waiting', () => {
  for (const confirmedAt of [null, '2026-09-17', '2027-01-01']) {
    const data = fixture(); data.plan.confirmedAt = confirmedAt;
    assert.equal(evaluate(data).state, 'awaiting_customer');
    assert.equal(evaluate(data).issues[0].role, 'healthPlanner');
  }
});
test('current assignment and task locks override historic completion', () => {
  for (const patch of [{ assignedTo: 'other' }, { isBlocked: true }, { serviceTracking: { linkId: 'service' } }]) {
    const data = fixture(); Object.assign(data.tasks[0], patch);
    assert.equal(evaluate(data).issues[0].code, 'preparation_changed');
  }
});
test('resource evidence requires both confirmations, recorder, valid date and actual note', () => {
  for (const patch of [{ customerConfirmed: false }, { resourceConfirmed: false }, { recordedBy: null },
    { recordedAt: 'bad' }, { recordedAt: '2027-01-01' }, { date: '2026-10-04' }, { note: '' }, { institution: '' }]) {
    const data = fixture(); Object.assign(data.tasks[1].formData.annualCheckupPreparation.evidence, patch);
    assert.equal(evaluate(data).issues[0].code, 'resources_not_current');
  }
});
test('cancelled or incomplete tasks and missing completion proof remain blocked', () => {
  for (const patch of [{ status: 'in_progress' }, { status: 'cancelled' }, { completedAt: null }, { completedAt: '2027-01-01' }]) {
    const data = fixture(); Object.assign(data.tasks[0], patch);
    assert.equal(evaluate(data).issues[0].code, 'preparation_incomplete');
  }
});
test('date correction cannot reuse stale task or plan preparation evidence', () => {
  const data = fixture(); data.tasks[0].formData.annualCheckupPreparation.targetDate = '2026-10-02';
  assert.equal(evaluate(data).issues[0].code, 'preparation_changed');
  const other = fixture(); other.plan.content.targetCheckupDate = '2026-10-02';
  assert.equal(evaluate(other).issues[0].code, 'plan_not_current');
});
test('wrong annual/client/schedule rows are excluded rather than paired by title', () => {
  for (const patch of [{ patientId: 'other' }, { sourceAnnualPlanId: 'old' }, { sourceScheduleKey: 'annual_checkup:2026-10-02:prepare:familyDoctor' }]) {
    const data = fixture(); Object.assign(data.tasks[0], patch);
    assert.equal(evaluate(data).issues[0].code, 'missing_preparation');
  }
});
test('outside preparation window, overdue checkup or missing owner is blocked', () => {
  const data = fixture(); data.now = '2026-09-18T10:00:00+08:00'; assert.equal(evaluate(data).state, 'blocked');
  data.now = '2026-10-04'; assert.equal(evaluate(data).state, 'blocked');
  const other = fixture(); delete other.patient.assignedHealthPlanner; assert.equal(evaluate(other).state, 'blocked');
});

function harness(data, changedOwner = false) {
  let reads = 0;
  const models = {
    AnnualPlan: { findById: () => ({ lean: async () => data.annual }) },
    User: { findById: () => ({ lean: async () => data.patient }) },
    HealthPlan: { findById: () => ({ lean: async () => data.plan }) },
    FollowUp: { findById: () => ({ lean: async () => ({ ...data.tasks[0], assignedTo: reads++ && changedOwner ? 'other' : 'advisor' }) }),
      find: query => {
        assert.equal(query.patientId, 'patient'); assert.equal(query.sourceAnnualPlanId, 'annual');
        assert.equal(query.sourceScheduleKey.$in.length, 2);
        return { lean: async () => data.tasks };
      } },
  };
  return models;
}
test('loader scopes exact keys and returns a read-only readiness result', async () => {
  const data = fixture();
  const result = await loadReadiness('task0', { _id: 'advisor', role: 'familyDoctor' }, harness(data), async () => data.gate, data.now);
  assert.equal(result.readyForServiceLink, true);
});
test('loader rechecks ownership before exposing paired preparation status', async () => {
  const data = fixture();
  await assert.rejects(loadReadiness('task0', { _id: 'advisor', role: 'familyDoctor' }, harness(data, true), async () => data.gate, data.now), { statusCode: 403 });
});
