const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandoffService } = require('../src/utils/checkupPreparationHandoff');
function fixture() {
  const state = { actor: { _id: 'planner', role: 'healthPlanner' },
    task: { _id: 'task', patientId: 'patient', assignedTo: 'planner', sourceAnnualPlanId: 'annual', sourceType: 'annual_service',
      workflowKey: 'annual_checkup_preparation:healthPlanner', sourceScheduleKey: 'annual_checkup:2026-10-03:prepare:healthPlanner',
      formData: { annualCheckupPreparation: { version: 1, role: 'healthPlanner' } } },
    annual: { _id: 'annual', confirmedAt: '2026-09-01' },
    readiness: { readyForServiceLink: true, targetDate: '2026-10-03', plan: { id: 'preparation' } },
    service: { _id: 'service', patientId: 'patient', title: '本次体检', type: 'medical_assist', status: 'draft',
      createdAt: '2026-09-10', updatedAt: '2026-09-19', initiationSource: 'staff', initiatedByStaff: 'planner',
      content: { serviceDomain: 'annual_checkup', serviceDate: '2026-10-03' } },
    links: new Map(), order: { _id: 'order' }, indexes: [{ key: { servicePlanId: 1 }, unique: true }], updates: 0 };
  const one = key => ({ findById: () => ({ lean: async () => state[key] }) });
  const models = {
    isValidId: id => typeof id === 'string' && Boolean(id),
    FollowUp: { ...one('task'), exists: async query => { assert.equal(query.workflowKey.$ne, 'service:intake'); return state.started || false; } },
    AnnualPlan: one('annual'),
    Order: { findOne: query => { assert.equal(query.user, 'patient'); assert.ok(query.$or); return { lean: async () => state.order }; } },
    HealthPlan: { ...one('service'), exists: async () => state.used || false,
      find: query => {
        assert.equal(query.patientId, 'patient'); assert.equal(query['content.serviceDomain'], 'annual_checkup');
        return { sort: () => ({ limit: () => ({ lean: async () => [state.service] }) }) };
      } },
    Handoff: {
      collection: { indexes: async () => state.indexes },
      findOne: query => ({ lean: async () => [...state.links.values()].find(row => Object.entries(query).every(([key, value]) => row[key] === value)) || null }),
      findById: id => ({ lean: async () => state.links.get(id) || null }),
      updateOne: async (query, update) => {
        state.updates++;
        const row = update.$setOnInsert;
        if (!state.links.has(query._id)) {
          if ([...state.links.values()].some(other => other.servicePlanId === row.servicePlanId)) throw Object.assign(new Error('duplicate'), { code: 11000, keyPattern: { servicePlanId: 1 } });
          state.links.set(query._id, structuredClone(row));
        }
        return {};
      },
    },
  };
  const api = createHandoffService(models, async () => structuredClone(state.readiness));
  return { state, models, api, link: (request = {}) => api.link('task', state.actor, { servicePlanId: 'service', updatedAt: '2026-09-19', ...request }) };
}
test('explicit service association persists proof only, no service/task/order mutation', async () => {
  const f = fixture(); const before = JSON.stringify(f.state.service);
  const link = await f.link(); assert.equal(link.status, 'linked_pending_activation');
  assert.equal(link._id, 'preparation'); assert.equal(link.servicePlanId, 'service'); assert.equal(link.linkedBy, 'planner');
  assert.equal(JSON.stringify(f.state.service), before);
});
test('duplicate network submission reuses association, cannot switch service', async () => {
  const f = fixture(); await f.link(); await f.link(); assert.equal(f.state.updates, 1);
  await assert.rejects(f.link({ servicePlanId: 'different' }), /不可直接替换/);
});
test('parallel identical association requests resolve to one stored relation', async () => {
  const f = fixture(); const rows = await Promise.all([f.link(), f.link()]);
  assert.equal(f.state.links.size, 1); assert.equal(rows[0]._id, rows[1]._id);
});
test('parallel different service selections cannot overwrite the winning relation', async () => {
  const f = fixture();
  f.models.HealthPlan.findById = id => ({ lean: async () => ({ ...f.state.service, _id: id }) });
  const rows = await Promise.allSettled([f.link(), f.link({ servicePlanId: 'second' })]);
  assert.equal(f.state.links.size, 1);
  assert.equal(rows.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(rows.filter(row => row.status === 'rejected').length, 1);
});
test('other staff and advisor preparation task cannot link services', async () => {
  const f = fixture(); f.state.actor._id = 'other'; await assert.rejects(f.link(), { statusCode: 403 });
  f.state.actor = { _id: 'planner', role: 'superadmin' };
  f.state.task.formData.annualCheckupPreparation.role = 'familyDoctor';
  f.state.task.workflowKey = 'annual_checkup_preparation:familyDoctor';
  f.state.task.sourceScheduleKey = 'annual_checkup:2026-10-03:prepare:familyDoctor';
  await assert.rejects(f.link(), { statusCode: 403 });
});
test('unready preparation blocks association even for superadmin', async () => {
  const f = fixture(); f.state.actor.role = 'superadmin'; f.state.readiness.readyForServiceLink = false;
  await assert.rejects(f.link(), /条件未齐备/); assert.equal(f.state.updates, 0);
});
test('cross-client, stale date, closed, legacy and wrong-domain services are rejected', async () => {
  for (const patch of [{ patientId: 'other' }, { type: 'annual_checkup' }, { status: 'completed' }, { status: 'cancelled' },
    { createdAt: '2025-01-01' }, { content: { serviceDomain: 'annual_checkup', serviceDate: '2026-10-02' } },
    { content: { templateName: '体检', serviceDate: '2026-10-03' } }]) {
    const f = fixture(); Object.assign(f.state.service, patch); await assert.rejects(f.link()); assert.equal(f.state.updates, 0);
  }
});
test('unpaid/invalid orders and undocumented staff services cannot be linked', async () => {
  const f = fixture(); f.state.service.sourceOrderId = 'order'; f.state.order = null;
  await assert.rejects(f.link(), /订单/);
  delete f.state.service.sourceOrderId; delete f.state.service.initiatedByStaff;
  await assert.rejects(f.link(), /凭据/);
});
test('eligible existing paid service is accepted without purchasing anything', async () => {
  const f = fixture(); f.state.service.sourceOrderId = 'order';
  assert.equal((await f.link()).servicePlanId, 'service');
});
test('started service and service referenced by another annual checkup are rejected', async () => {
  const f = fixture(); f.state.started = true; await assert.rejects(f.link(), /执行记录/);
  f.state.started = false; f.state.used = true; await assert.rejects(f.link(), /其他体检方案/);
});
test('another preparation claim prevents reusing its service', async () => {
  const f = fixture(); f.state.links.set('other', { _id: 'other', servicePlanId: 'service', plannerTaskId: 'other-task' });
  await assert.rejects(f.link(), /其他准备方案/);
});
test('missing or partial unique index blocks writes and never creates indexes', async () => {
  for (const indexes of [[], [{ key: { servicePlanId: 1 } }], [{ key: { servicePlanId: 1 }, unique: true, partialFilterExpression: { active: true } }]]) {
    const f = fixture(); f.state.indexes = indexes; await assert.rejects(f.link(), /唯一索引/); assert.equal(f.state.updates, 0);
  }
});
test('stale selection and invalid identifiers fail before persistence', async () => {
  const f = fixture(); await assert.rejects(f.link({ updatedAt: '2025-01-01' }), /服务已变化/);
  await assert.rejects(f.link({ servicePlanId: '' }), { statusCode: 400 }); assert.equal(f.state.updates, 0);
});
test('options include only eligible same-date services and existing link stops reselection', async () => {
  const f = fixture(); assert.equal((await f.api.options('task', f.state.actor)).services.length, 1);
  f.state.started = true; assert.equal((await f.api.options('task', f.state.actor)).services.length, 0);
  f.state.started = false; await f.link(); const result = await f.api.options('task', f.state.actor);
  assert.equal(result.services.length, 0); assert.equal(result.link.servicePlanId, 'service');
});
