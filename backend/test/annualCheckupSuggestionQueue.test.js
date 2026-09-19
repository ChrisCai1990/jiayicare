const { test } = require('node:test');
const assert = require('node:assert/strict');
const sift = require('sift').default;
const { drainQueue } = require('../src/utils/checkupSuggestionQueue');

function fixture(count = 1) {
  const plans = Array.from({ length: count }, (_, i) => ({ _id: `p${i}`, preparationTaskId: `t${i}`, preparationAddonAuto: true,
    preparationAddonReview: null, staffId: 'advisor', patientId: 'patient', updatedAt: new Date(), status: 'draft', pushedAt: null, content: { aiStatus: 'pending' } }));
  const runs = new Map(); const calls = [];
  const state = { plans, runs, calls, linked: true, actor: { _id: 'advisor', role: 'familyDoctor', staffStatus: 'active', tenantId: 'tenant' },
    patient: { _id: 'patient', tenantId: 'tenant' }, role: { permissions: { followups: { edit: true }, plans: { edit: true } } } };
  const list = rows => ({ sort: () => ({ lean: () => ({ cursor: async function* () { for (const row of rows) yield structuredClone(row); } }) }) });
  const models = {
    HealthPlan: { find: query => list(plans.filter(sift(query))), findById: id => ({ lean: async () => plans.find(plan => plan._id === id) }) },
    FollowUp: { findById: id => ({ lean: async () => ({ formData: { annualCheckupPreparation: { evidence: { healthPlanId: state.linked ? id.replace('t', 'p') : null } } } }) }) },
    Admin: { findById: () => ({ lean: async () => state.actor }) },
    User: { findById: () => ({ lean: async () => state.patient }) },
    StaffRole: { findById: () => ({ lean: async () => state.role }) },
    Suggestion: {
      find: query => list([...runs.values()].filter(sift(query))),
      updateOne: async (query, update, options) => {
        if (options?.upsert && !runs.has(query._id)) runs.set(query._id, structuredClone(update.$setOnInsert));
        const row = runs.get(query._id);
        if (row && sift(query)(row)) Object.assign(row, update.$set);
        return { matchedCount: row ? 1 : 0 };
      },
    },
  };
  const service = { generate: async (taskId, actor, input) => {
    calls.push({ taskId, actor, input });
    if (state.fail) throw new Error('private details');
    runs.get(taskId.replace('t', 'p')).status = 'ready';
  } };
  return { state, models, service, drain: () => drainQueue(models, service) };
}

test('new marked drafts are durably queued and drained, subsequent scans do not regenerate', async () => {
  const f = fixture(); await f.drain(); await f.drain();
  assert.equal(f.state.calls.length, 1); assert.equal(f.state.runs.get('p0').status, 'ready');
  assert.equal(f.state.calls[0].input.token, f.state.runs.get('p0').token);
});
test('unmarked historical drafts and unbound drafts never enter automatic generation', async () => {
  const f = fixture(); f.state.linked = false; await f.drain(); assert.equal(f.state.runs.size, 0);
  f.state.linked = true; delete f.state.plans[0].preparationAddonAuto; await f.drain(); assert.equal(f.state.calls.length, 0);
});
test('durable queued records survive interruption and are drained without recreating them', async () => {
  const f = fixture(); f.state.runs.set('p0', { _id: 'p0', taskId: 't0', token: 'persisted', actorId: 'advisor', status: 'queued' });
  await f.drain(); assert.equal(f.state.calls[0].input.token, 'persisted');
});
test('running and failed records are not stolen or automatically retried', async () => {
  const f = fixture(2);
  f.state.runs.set('p0', { _id: 'p0', status: 'running' }); f.state.runs.set('p1', { _id: 'p1', status: 'failed' });
  await f.drain(); assert.equal(f.state.calls.length, 0); assert.equal(f.state.runs.get('p0').status, 'running');
});
test('drains more than a fixed page of records without losing the tail', async () => {
  const f = fixture(501); await f.drain(); assert.equal(f.state.calls.length, 501);
});
test('missing/inactive actor, wrong tenant and withdrawn permissions fail closed', async () => {
  for (const mutate of [s => { s.actor = null; }, s => { s.actor.staffStatus = 'inactive'; }, s => { s.actor.role = 'healthPlanner'; },
    s => { s.actor.tenantId = 'other'; }, s => { s.actor.customRoleId = 'role'; s.role = null; },
    s => { s.actor.customRoleId = 'role'; s.role.permissions.plans.edit = false; },
    s => { s.actor.customRoleId = 'role'; s.role.permissions.plans.planTypes = { annual_checkup: false }; }]) {
    const f = fixture(); mutate(f.state); await f.drain();
    assert.equal(f.state.calls.length, 0); assert.equal(f.state.runs.get('p0').status, 'failed');
  }
});
test('preflight failure persists a safe failure and does not stop other jobs or retry', async () => {
  const f = fixture(2); f.state.fail = true;
  await f.drain(); await f.drain(); assert.equal(f.state.calls.length, 2);
  assert.equal([...f.state.runs.values()].every(row => row.status === 'failed'), true);
  assert.equal(JSON.stringify([...f.state.runs.values()]).includes('private details'), false);
});
