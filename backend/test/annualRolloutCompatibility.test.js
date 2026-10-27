const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const selected = '111111111111111111111111', other = '222222222222222222222222';
test('actual annual page buttons preserve legacy availability and enforce pilot readiness', () => {
  const page = fs.readFileSync(require('node:path').resolve(__dirname, '../../staff/src/pages/AnnualMgmtPlanPage.jsx'), 'utf8');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { transformSync } = require('esbuild');
  const start = page.lastIndexOf('<button', page.indexOf('onClick={handleGenerateAIAnnualPlan}'));
  const end = page.indexOf('</button>}', page.indexOf('onClick={handlePush}', start)) + '</button>}'.length;
  const expression = page.match(/const preparationBlocked = ([^\r\n]+)/)[1];
  const compiled = transformSync('const buttons = <>' + page.slice(start, end) + '</>; buttons;', { loader: 'jsx', format: 'cjs' }).code;
  for (const [closedLoopEnabled, ready, disabled, preparationSelectionChanged = false] of [[false, false, false], [true, false, true], [true, true, false], [true, true, false, true], [false, true, false, true]]) {
    const preparation = { checklist: { ready } };
    const preparationBlocked = vm.runInNewContext(expression, { closedLoopEnabled, preparation, preparationSelectionChanged, pushedAt: null });
    const buttons = vm.runInNewContext(compiled, { React, preparationBlocked, handleGenerateAIAnnualPlan() {}, handlePush() {},
      patient: { aiHealthSummary: { sections: {} } }, aiPlanLoading: false, pushing: false, dirty: false, metricSelectionDirty: false, planType: 'legacy', plansByType: {}, pushedAt: null, confirmedAt: null });
    assert.equal(Boolean(buttons.props.children[0].props.disabled), disabled, JSON.stringify({ closedLoopEnabled, ready, preparationBlocked }));
    assert.equal(Boolean(buttons.props.children[1].props.disabled), disabled, JSON.stringify({ closedLoopEnabled, ready, preparationBlocked }));
  }
  const published = vm.runInNewContext(compiled, { React, preparationBlocked: false, handleGenerateAIAnnualPlan() {}, handlePush() {},
    patient: {}, aiPlanLoading: false, pushing: false, dirty: false, metricSelectionDirty: false, planType: 'legacy',
    plansByType: {}, pushedAt: '2026-10-02T00:00:00Z', confirmedAt: null });
  assert.equal(published.props.children[0].props.disabled, true);
  assert.equal(published.props.children[1], false);
});
function handler(method, path, context) {
  const start = source.indexOf(`router.${method}('${path}', staffAuth, async (req, res) => {`);
  assert.ok(start > 0);
  const first = source.indexOf('async (req, res)', start);
  const end = source.indexOf('\n});', first);
  return vm.runInNewContext('(' + source.slice(first, end + 2) + ')', context);
}
function response() { return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
test('selected customer readiness blocks annual AI before generation dependencies', async () => {
  let checklistReads = 0;
  const run = handler('post', '/patients/:id/ai-annual-plan', {
    getVisiblePlanPatientIds: async () => [selected], User: { findById: async () => ({ _id: selected }) },
    AnnualPlan: { findOne: () => ({ select: () => ({ lean: async () => null }) }) },
    require: name => {
      if (name.endsWith('/healthManagementRollout')) return { enabledForPatient: () => true };
      if (name.endsWith('/annualPlanPreparation')) return { loadAnnualPlanPreparationChecklist: async () => { checklistReads++; return { checklist: { ready: false } }; } };
      assert.fail('unexpected dependency ' + name);
    },
  });
  const res = response();
  await run({ staff: { role: 'familyDoctor' }, params: { id: selected }, body: {} }, res);
  assert.equal(res.code, 409);
  assert.equal(checklistReads, 1);
  assert.match(res.body.message, /准备清单/);
});
test('已推送或已确认的年度方案不再启动AI生成，修改走局部修订', async () => {
  const runFor = plan => handler('post', '/patients/:id/ai-annual-plan', {
    getVisiblePlanPatientIds: async () => [selected], User: { findById: async () => ({ _id: selected }) },
    AnnualPlan: { findOne: () => ({ select: () => ({ lean: async () => plan }) }) },
    require: () => assert.fail('正式方案不应再读取AI生成依赖'),
  });
  for (const [plan, expected] of [[{ _id: 'p1', confirmedAt: null }, /局部修订/], [{ _id: 'p1', confirmedAt: new Date() }, /单项随访/]]) {
    const res = response();
    await runFor(plan)({ staff: { role: 'familyDoctor' }, params: { id: selected }, body: { year: 2026 } }, res);
    assert.equal(res.code, 409);
    assert.match(res.body.message, expected);
  }
});
test('已完成分发的方案不能重复推送或重新校验已经变化的来源', async () => {
  const run = handler('patch', '/patients/:id/annual-plan/push', {
    getVisiblePlanPatientIds: async () => [selected],
    AnnualPlan: { findOne: async () => ({ _id: 'p1', pushedAt: new Date('2026-10-02T00:00:00Z') }) },
    require: () => assert.fail('已推送方案不应再读当前来源'),
  });
  const res = response();
  await run({ staff: { role: 'familyDoctor' }, params: { id: selected }, query: { year: '2026' } }, res);
  assert.equal(res.code, 409);
  assert.match(res.body.message, /方案已推送/);
});
test('顾问推送即生成随访和服务任务，客户确认时间保持空白', async () => {
  const events = [];
  const plan = { _id: 'p1', patientId: selected, year: 2026, moduleData: {}, confirmedAt: null,
    markModified() {}, save: async function () { events.push('save'); } };
  const run = handler('patch', '/patients/:id/annual-plan/push', {
    getVisiblePlanPatientIds: async () => [selected], AnnualPlan: { findOne: async () => plan },
    PushRecord: { findOne: async () => null, create: async () => { events.push('notify'); } },
    require: name => {
      if (name.endsWith('/healthManagementRollout')) return { enabledForPatient: () => false };
      if (name.endsWith('/annualPlanPublishValidation')) return { validate: () => '' };
      if (name.endsWith('/annualPlanTaskSplit')) return { syncAnnualPlanTaskSplit: async () => { events.push('dispatch'); return { clientTasks: 1, scheduledFollowUps: 1, serviceTasks: { created: 1 }, warnings: [] }; } };
      if (name.endsWith('/annualPlanServiceVersions')) return { byCode: () => null };
      if (name.endsWith('/annualNutrition.cjs')) return { isRow: () => false };
      assert.fail('unexpected dependency ' + name);
    },
  });
  const res = response();
  await run({ staff: { role: 'familyDoctor', _id: 'advisor' }, params: { id: selected }, query: { year: '2026' } }, res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(plan.confirmedAt, null);
  assert.ok(plan.followUpReleasedAt && plan.serviceTaskReleasedAt && plan.distributionSyncedAt);
  assert.deepEqual(events, ['save', 'dispatch', 'save', 'notify']);
});
test('annual publishing reads readiness only for persisted selected owner', async () => {
  for (const patientId of [other, selected]) {
    let checklistReads = 0, saves = 0;
    const plan = { patientId, moduleData: {}, markModified() {}, save: async () => { saves++; throw Error('test stops before dispatch and notification'); } };
    const run = handler('patch', '/patients/:id/annual-plan/push', {
      getVisiblePlanPatientIds: async () => [patientId], AnnualPlan: { findOne: async () => plan },
      require: name => {
        if (name.endsWith('/healthManagementRollout')) return { enabledForPatient: id => id === selected };
        if (name.endsWith('/annualPlanPreparation')) return { loadAnnualPlanPreparationChecklist: async () => { checklistReads++; return { checklist: { ready: false } }; } };
        if (name.endsWith('/annualPlanPublishValidation')) return { validate: () => '' };
        assert.fail('unexpected dependency ' + name);
      },
    });
    const res = response();
    await run({ staff: { role: 'familyDoctor' }, params: { id: patientId }, query: {} }, res);
    assert.equal(checklistReads, patientId === selected ? 1 : 0);
    assert.equal(saves, patientId === selected ? 0 : 1, JSON.stringify(res.body));
    assert.equal(res.code, patientId === selected ? 409 : 500);
    if (patientId === other) assert.equal(plan.formalizedAt, undefined);
  }
});
test('legacy confirmation is idempotent without freeze or new automatic preparation intent', async t => {
  const keys = ['HEALTH_MANAGEMENT_ROLLOUT_MODE', 'HEALTH_MANAGEMENT_PATIENT_IDS'];
  const prior = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; }));
  process.env.HEALTH_MANAGEMENT_ROLLOUT_MODE = 'allowlist'; process.env.HEALTH_MANAGEMENT_PATIENT_IDS = selected;
  const { confirmPublishedAnnualPlan, assertAnnualConfirmationAccess } = require('../src/utils/annualPlanConfirmation');
  let saves = 0;
  const plan = { patientId: other, save: async () => { saves++; } };
  const now = new Date();
  await assertAnnualConfirmationAccess(plan, {});
  await confirmPublishedAnnualPlan(plan, now); await confirmPublishedAnnualPlan(plan);
  assert.equal(saves, 1); assert.equal(plan.confirmedAt, now);
  assert.equal(plan.frozenAt, undefined); assert.equal(plan.checkupPreparationAutoConfirmedAt, undefined);
  await assert.rejects(confirmPublishedAnnualPlan({ patientId: selected, save: async () => assert.fail() }), { statusCode: 409 });
});
