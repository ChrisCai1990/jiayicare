const { test } = require('node:test');
const assert = require('node:assert/strict');
const sift = require('sift').default;
const { createActivationService } = require('../src/utils/checkupPreparationActivation');
const copy = value => structuredClone(value);
function fixture() {
  const state = { actor: { _id: 'planner', role: 'healthPlanner' },
    prep: { _id: 'prep-task', patientId: 'patient', sourceAnnualPlanId: 'annual', assignedTo: 'planner', sourceType: 'annual_service',
      workflowKey: 'annual_checkup_preparation:healthPlanner', sourceScheduleKey: 'annual_checkup:2026-10-03:prepare:healthPlanner',
      formData: { annualCheckupPreparation: { role: 'healthPlanner', version: 1 } } },
    link: { _id: 'plan', patientId: 'patient', annualPlanId: 'annual', plannerTaskId: 'prep-task', servicePlanId: 'service', status: 'linked_pending_activation', activation: null },
    service: { _id: 'service', status: 'active', pushedAt: '2026-09-19', content: { followUpPlans: [{ id: 'design-scheme' }, { id: 'booking-scheme' }] } },
    patient: { assignedFamilyDoctor: 'advisor', assignedHealthPlanner: 'planner' },
    readiness: { readyForServiceLink: true, plan: { id: 'plan' } },
    schemes: [{ _id: 'design-scheme', workflowStageKey: 'plan_design', executorRole: 'familyDoctor' }, { _id: 'booking-scheme', workflowStageKey: 'booking', executorRole: 'healthPlanner' }], writes: [] };
  state.tasks = ['design', 'booking'].map(step => ({ _id: step, patientId: 'patient', sourceHealthPlanId: 'service', sourceType: 'health_plan', taskRole: 'executor',
    workflowKey: `${step}-scheme`, followUpSchemeId: `${step}-scheme`, assignedTo: step === 'design' ? 'advisor' : 'planner',
    status: 'planned', isBlocked: step === 'booking', dependsOnTaskId: step === 'booking' ? 'design' : null,
    updatedAt: '2026-09-19', checkupPreparationActivation: null }));
  function apply(row, update) {
    for (const [path, value] of Object.entries(update.$set || {})) {
      const keys = path.split('.'); const last = keys.pop(); let node = row;
      for (const key of keys) node = node[key] ||= {};
      node[last] = copy(value);
    }
    for (const [key, value] of Object.entries(update.$push || {})) (row[key] ||= []).push(copy(value));
  }
  const models = {
    FollowUp: { findById: id => ({ lean: async () => copy(id === 'prep-task' ? state.prep : state.tasks.find(row => row._id === id) || null) }),
      find: () => ({ lean: async () => copy(state.tasks) }), updateOne: async (query, update) => {
        const row = state.tasks.find(sift(query));
        if (!row || (query._id === 'booking' && state.blockBooking)) return { matchedCount: 0 };
        apply(row, update); state.writes.push(row._id); return { matchedCount: 1 };
      } },
    HealthPlan: { findById: () => ({ lean: async () => copy(state.service) }) },
    User: { findById: () => ({ lean: async () => copy(state.patient) }) },
    FollowUpPlan: { find: () => ({ lean: async () => copy(state.schemes) }) },
    Handoff: { collection: { indexes: async () => state.noIndex ? [] : [{ key: { servicePlanId: 1 }, unique: true }] },
      findOne: () => ({ lean: async () => copy(state.link) }), findById: () => ({ lean: async () => copy(state.link) }),
      exists: async query => !state.loseClaim && sift(query)(state.link),
      updateOne: async (query, update) => {
        if (!sift(query)(state.link)) return { matchedCount: 0 };
        if (update.$set?.status === 'active' && state.failFinal) throw new Error('database failure');
        apply(state.link, update); return { matchedCount: 1 };
      } },
  };
  const service = createActivationService(models, async () => copy(state.readiness), async (service, task, readiness, ownedIds) => {
    state.ownedIds = ownedIds; return state.invalidTarget ? '订单或服务失效' : '';
  });
  return { state, models, service, activate: () => service.activate('prep-task', state.actor) };
}
test('existing intake reuses explicit planner handoff evidence, replay is inert', async () => {
  const f = fixture();
  f.state.tasks.push({ _id: 'intake', patientId: 'patient', sourceHealthPlanId: 'service', sourceType: 'health_plan',
    workflowKey: 'service:intake', taskRole: 'supervisor', assignedTo: 'planner', status: 'planned', updatedAt: '2026-09-19' });
  await f.activate();
  const intake = f.state.tasks[2];
  assert.equal(intake.status, 'completed');
  assert.equal(intake.formData.checkupPreparationIntake.linkId, f.state.link._id);
  const writes = f.state.writes.length;
  await f.activate();
  assert.equal(f.state.writes.length, writes);
});

test('active handoff without stored preparation evidence cannot complete intake', async () => {
  const f = fixture();
  await f.activate();
  f.state.tasks.push({ _id: 'intake', patientId: 'patient', sourceHealthPlanId: 'service', sourceType: 'health_plan',
    workflowKey: 'service:intake', taskRole: 'supervisor', assignedTo: 'planner', status: 'planned' });
  f.state.link.activation.evidence = null;
  await assert.rejects(f.activate(), /凭据/);
  assert.equal(f.state.tasks[2].status, 'planned');
});

test('intake evidence preserves human completion and rejects reassignment or duplicates', async () => {
  for (const variant of ['completed', 'other_owner', 'duplicate']) {
    const f = fixture();
    const intake = { _id: 'intake', patientId: 'patient', sourceHealthPlanId: 'service', sourceType: 'health_plan',
      workflowKey: 'service:intake', taskRole: 'supervisor', assignedTo: variant === 'other_owner' ? 'other' : 'planner',
      status: variant === 'completed' ? 'completed' : 'planned', executedContent: 'human evidence' };
    f.state.tasks.push(intake);
    if (variant === 'duplicate') f.state.tasks.push({ ...intake, _id: 'intake2' });
    if (variant === 'completed') await f.activate();
    else await assert.rejects(f.activate(), /收单/);
    assert.equal(intake.executedContent, 'human evidence');
    assert.equal(intake.formData, undefined);
  }
});

test('activates existing booking only, reuses completed preparation without creating tasks', async () => {
  const f = fixture(); await f.activate();
  assert.equal(f.state.link.status, 'active'); assert.equal(f.state.tasks[0].status, 'completed');
  assert.equal(f.state.tasks[1].status, 'in_progress'); assert.equal(f.state.tasks[1].isBlocked, false);
  assert.equal(f.state.tasks.length, 2); assert.deepEqual(f.state.writes, ['design', 'booking']);
});
test('network replay and parallel activation do not execute steps twice', async () => {
  const f = fixture(); await Promise.allSettled([f.activate(), f.activate()]); await f.activate();
  assert.deepEqual(f.state.writes, ['design', 'booking']);
});
test('partial booking failure preserves completed design and retry resumes only booking', async () => {
  const f = fixture(); f.state.blockBooking = true; await assert.rejects(f.activate());
  assert.equal(f.state.link.status, 'activation_failed'); assert.deepEqual(f.state.writes, ['design']);
  f.state.blockBooking = false; await f.activate();
  assert.deepEqual(f.state.writes, ['design', 'booking']); assert.deepEqual(f.state.ownedIds, ['design']);
});
test('lost final write reconciles task proof without resetting subsequent execution', async () => {
  const f = fixture(); f.state.failFinal = true; await assert.rejects(f.activate());
  f.state.tasks[1].status = 'completed'; f.state.failFinal = false; f.state.readiness.readyForServiceLink = false;
  await f.activate(); assert.equal(f.state.link.status, 'active'); assert.equal(f.state.tasks[1].status, 'completed');
  assert.deepEqual(f.state.writes, ['design', 'booking']);
});
test('unready source, missing index or invalid target does not activate booking', async () => {
  for (const mutate of [s => { s.readiness.readyForServiceLink = false; }, s => { s.noIndex = true; }, s => { s.invalidTarget = true; },
    s => { s.service.status = 'draft'; }, s => { s.service.content.aiStatus = 'pending'; }]) {
    const f = fixture(); mutate(f.state); await assert.rejects(f.activate()); assert.equal(f.state.writes.length, 0);
  }
});
test('missing/duplicate schemes or tasks and wrong assignment fail closed', async () => {
  for (const mutate of [s => { s.schemes.pop(); }, s => { s.schemes.push(s.schemes[0]); }, s => { s.tasks.pop(); },
    s => { s.tasks.push(s.tasks[1]); }, s => { s.tasks[1].assignedTo = 'other'; }, s => { s.tasks[1].dependsOnTaskId = 'other'; }]) {
    const f = fixture(); mutate(f.state); await assert.rejects(f.activate()); assert.equal(f.state.writes.length, 0);
  }
});
test('unfinished service intake cannot be bypassed', async () => {
  const f = fixture(); f.state.tasks[0].dependsOnTaskId = 'intake';
  f.state.tasks.push({ _id: 'intake', status: 'planned', sourceHealthPlanId: 'service' });
  await assert.rejects(f.activate(), /前置任务/); assert.equal(f.state.writes.length, 0);
});
test('wrong scheme role or already unblocked booking is rejected before any task write', async () => {
  const f = fixture(); f.state.schemes[1].executorRole = 'healthManager'; await assert.rejects(f.activate());
  assert.equal(f.state.writes.length, 0);
  f.state.schemes[1].executorRole = 'healthPlanner'; f.state.tasks[1].isBlocked = false; await assert.rejects(f.activate());
  assert.equal(f.state.writes.length, 0);
});
test('already executing or independently completed task is not overwritten', async () => {
  for (const status of ['in_progress', 'completed', 'cancelled']) {
    const f = fixture(); f.state.tasks[0].status = status; await assert.rejects(f.activate()); assert.equal(f.state.writes.length, 0);
  }
});
test('running attempt cannot be stolen, and former planner cannot activate', async () => {
  const f = fixture(); f.state.link.status = 'activating'; await assert.rejects(f.activate(), /不可重复抢占/);
  f.state.link.status = 'linked_pending_activation'; f.state.actor._id = 'other'; await assert.rejects(f.activate(), { statusCode: 403 });
});
test('lost claim prevents subsequent task writes', async () => {
  const f = fixture(); f.state.loseClaim = true; await assert.rejects(f.activate()); assert.equal(f.state.writes.length, 0);
});
test('administrator recovery requires explicit stopped-process evidence and current token', async () => {
  const f = fixture(); f.state.link.status = 'activating'; f.state.link.activation = { token: 'run' };
  const request = { token: 'run', processStopped: true, reason: 'old worker stopped' };
  await assert.rejects(f.service.recover('prep-task', f.state.actor, request), { statusCode: 403 });
  const admin = { _id: 'admin', role: 'superadmin' };
  await assert.rejects(f.service.recover('prep-task', admin, { ...request, processStopped: false }));
  await assert.rejects(f.service.recover('prep-task', admin, { ...request, token: 'old' }));
  await f.service.recover('prep-task', admin, request);
  assert.equal(f.state.link.status, 'activation_failed'); assert.equal(f.state.link.activationHistory[0].by, 'admin');
});
