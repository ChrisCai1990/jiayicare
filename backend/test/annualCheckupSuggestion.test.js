const { test } = require('node:test');
const assert = require('node:assert/strict');
const sift = require('sift').default;
const { createSuggestionService } = require('../src/utils/checkupPreparationSuggestion');
const copy = value => structuredClone(value);
const date = new Date('2026-09-01T00:00:00Z');

function fixture(chat = async () => JSON.stringify({ chosen: [{ index: 0, reason: 'reviewed evidence', sourceKeys: ['assessment:a'] }], note: 'review' })) {
  const state = {
    actor: { _id: 'advisor', role: 'familyDoctor' },
    task: { _id: 'task', patientId: 'p', sourceAnnualPlanId: 'annual', assignedTo: 'advisor', status: 'in_progress',
      sourceType: 'annual_service', workflowKey: 'annual_checkup_preparation:familyDoctor', sourceScheduleKey: 'annual_checkup:2027-03-15:prepare:familyDoctor',
      formData: { annualCheckupPreparation: { version: 1, role: 'familyDoctor', evidence: { healthPlanId: 'plan' } } } },
    annual: { _id: 'annual', patientId: 'p', confirmedAt: date, pushedAt: date, reviewStatus: 'approved' },
    plan: { _id: 'plan', preparationTaskId: 'task', patientId: 'p', type: 'annual_checkup', status: 'draft', createdAt: date, updatedAt: date, pushedAt: null,
      items: [{ name: 'base', itemGroup: 'base' }], preparationAddonReview: null,
      content: { annualPlanId: 'annual', aiStatus: 'pending', clientBrand: 'brand', templateId: 'template', checkItems: [{ name: 'base' }], addons: [{ name: 'extra', type: 'lab' }] } },
    patient: { _id: 'p', clientBrand: 'brand' },
    assessments: [{ _id: 'a', patientId: 'p', purpose: 'annual_input', status: 'approved', advisorReviewedBy: 'advisor', advisorReviewedAt: date, facts: ['reviewed evidence'] }],
    reports: [], run: null, calls: 0,
  };
  const one = key => ({ findById: () => ({ lean: async () => copy(state[key]) }) });
  const many = key => ({ find: () => ({ limit: () => ({ lean: async () => copy(state[key]) }) }) });
  function apply(row, update) {
    Object.assign(row, copy(update.$set || {}));
    for (const [key, value] of Object.entries(update.$push || {})) {
      row[key] ||= []; row[key].push(...copy(value.$each || [value]));
    }
  }
  const models = { FollowUp: one('task'), AnnualPlan: one('annual'), User: one('patient'),
    ProfessionalHealthAssessment: many('assessments'), MedicalReport: many('reports'),
    HealthPlan: { ...one('plan'), updateOne: async (filter, update) => {
      if (state.planConflict || !sift(filter)(state.plan)) return { matchedCount: 0 };
      apply(state.plan, update); state.plan.updatedAt = new Date(); return { matchedCount: 1 };
    } },
    Suggestion: { ...one('run'), updateOne: async (filter, update, options) => {
      if (!state.run && options?.upsert) { state.run = copy(update.$setOnInsert); return { upsertedCount: 1 }; }
      if (options?.upsert) return { upsertedCount: 0 };
      if (!state.run || !sift(filter)(state.run)) return { matchedCount: 0 };
      apply(state.run, update); return { matchedCount: 1 };
    } },
  };
  const service = createSuggestionService(models, async (...args) => { state.calls++; return chat(...args); });
  return { state, models, service, generate: (body = {}) => service.generate('task', state.actor, { updatedAt: state.plan.updatedAt, token: state.run?.token, ...body }),
    review: (indexes = [0]) => service.review('task', state.actor, { token: state.run?.token, indexes }) };
}

test('generation persists separate pending suggestions, never edits plan or approves', async () => {
  const f = fixture(); const original = copy(f.state.plan);
  assert.equal((await f.generate()).run.status, 'ready');
  assert.deepEqual(f.state.plan, original);
  assert.equal(f.state.run.input.sources[0].key, 'assessment:a');
  assert.equal((await f.generate()).reused, true); assert.equal(f.state.calls, 1);
});

test('parallel first requests claim the unique plan record and call AI once', async () => {
  const f = fixture();
  await Promise.all([f.generate(), f.generate(), f.generate()]);
  assert.equal(f.state.calls, 1); assert.equal(f.state.run.status, 'ready');
});

test('persisted running claim is never stolen by refresh or another generation', async () => {
  const f = fixture(); f.state.run = { _id: 'plan', token: 'old', status: 'running', startedAt: date };
  assert.equal((await f.generate()).run.token, 'old'); assert.equal(f.state.calls, 0);
  assert.equal((await f.service.read('task', f.state.actor)).run.status, 'running');
});

test('provider failure is persisted safely, explicit retry retains previous attempt', async () => {
  const f = fixture(async () => { throw new Error('private provider response'); });
  await f.generate(); assert.equal(f.state.run.status, 'failed');
  assert.equal(JSON.stringify(f.state.run).includes('private provider'), false);
  const token = f.state.run.token;
  await f.generate(); assert.equal(f.state.calls, 2);
  assert.notEqual(f.state.run.token, token); assert.equal(f.state.run.history[0].token, token);
});

test('invalid model output fails instead of creating unreviewed items', async () => {
  const f = fixture(async () => '{"chosen":[{"index":99}],"note":""}');
  await f.generate(); assert.equal(f.state.run.status, 'failed'); assert.equal(f.state.plan.items.length, 1);
});

test('no audited sources skips without calling provider', async () => {
  const f = fixture(); f.state.assessments = [];
  await f.generate(); assert.equal(f.state.calls, 0); assert.equal(f.state.run.status, 'skipped');
  await f.review([]); assert.equal(f.state.plan.items.length, 1);
});

test('review atomically adds selected items plus proof and retry adds nothing', async () => {
  const f = fixture(); await f.generate(); await f.review(); await f.review();
  assert.equal(f.state.plan.items.length, 2); assert.equal(f.state.plan.items[1].itemGroup, 'addon');
  assert.equal(f.state.plan.preparationAddonReview.reviewedBy, 'advisor');
  assert.equal(f.state.plan.content.aiStatus, 'pending'); assert.equal(f.state.plan.status, 'draft');
  await assert.rejects(f.generate(), /已审核/);
});

test('review can reject all add-ons without modifying base', async () => {
  const f = fixture(); await f.generate(); await f.review([]);
  assert.equal(f.state.plan.items.length, 1); assert.deepEqual(f.state.plan.preparationAddonReview.indexes, []);
});

test('unsupported selections, stale token and changed clinical sources block review', async () => {
  const f = fixture(); await f.generate();
  for (const indexes of [[0, 0], [99], ['0'], null]) await assert.rejects(f.review(indexes));
  await assert.rejects(f.service.review('task', f.state.actor, { token: 'wrong', indexes: [] }));
  f.state.assessments[0].facts = ['changed'];
  await assert.rejects(f.review(), /资料已变化/); assert.equal(f.state.plan.items.length, 1);
});

test('regeneration after source change uses new token, old review is rejected', async () => {
  const f = fixture(); await f.generate(); const old = f.state.run.token;
  f.state.assessments[0].facts = ['new']; await f.generate();
  assert.equal(f.state.calls, 2); assert.notEqual(f.state.run.token, old);
  await assert.rejects(f.service.review('task', f.state.actor, { token: old, indexes: [0] }));
});

test('plan write conflict never partially applies review or new items', async () => {
  const f = fixture(); await f.generate(); f.state.planConflict = true;
  await assert.rejects(f.review(), /方案已被修改/);
  assert.equal(f.state.plan.preparationAddonReview, null); assert.equal(f.state.plan.items.length, 1);
});

test('owner, stage, source and version restrictions apply before AI', async () => {
  for (const mutate of [s => { s.actor._id = 'other'; }, s => { s.actor.role = 'healthPlanner'; },
    s => { s.task.status = 'completed'; }, s => { s.task.isBlocked = true; }, s => { s.plan.preparationTaskId = 'other'; },
    s => { s.plan.content.aiStatus = 'approved'; }, s => { s.plan.pushedAt = date; }, s => { s.annual.reviewStatus = 'pending'; }]) {
    const f = fixture(); mutate(f.state); await assert.rejects(f.generate()); assert.equal(f.state.calls, 0);
  }
  const f = fixture(); await assert.rejects(f.generate({ updatedAt: '2020-01-01' })); assert.equal(f.state.calls, 0);
});

test('reassignment after generation blocks read and adoption by former advisor', async () => {
  const f = fixture(); await f.generate(); f.state.task.assignedTo = 'other';
  await assert.rejects(f.service.read('task', f.state.actor), /负责岗位/);
  await assert.rejects(f.review(), /负责岗位/);
});

test('oversize source set fails before calling provider', async () => {
  const f = fixture(); f.state.reports = Array.from({ length: 101 }, () => ({}));
  await assert.rejects(f.generate(), /资料数量/); assert.equal(f.state.calls, 0);
});

test('only superadmin with explicit stopped confirmation and run token may recover', async () => {
  const f = fixture(); f.state.run = { _id: 'plan', token: 'old', status: 'running' };
  const request = { token: 'old', processStopped: true, reason: 'checked worker stopped' };
  await assert.rejects(f.service.recover('task', f.state.actor, request), /管理员/);
  const admin = { _id: 'admin', role: 'superadmin' };
  for (const patch of [{ token: undefined }, { processStopped: false }, { reason: '' }]) {
    await assert.rejects(f.service.recover('task', admin, { ...request, ...patch }));
  }
  await f.service.recover('task', admin, request);
  assert.equal(f.state.run.status, 'failed'); assert.equal(f.state.run.history[0].by, 'admin');
});

test('late provider return after recovery cannot overwrite recovered run', async () => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const f = fixture(async () => { entered(); return new Promise(resolve => { release = resolve; }); });
  const generating = f.generate(); await started;
  await f.service.recover('task', { _id: 'admin', role: 'superadmin' }, { token: f.state.run.token, processStopped: true, reason: 'confirmed stop' });
  release(JSON.stringify({ chosen: [], note: 'late' })); await generating;
  assert.equal(f.state.run.status, 'failed'); assert.equal(f.state.run.result, null);
});
