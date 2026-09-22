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
  const end = page.indexOf('</button>', page.indexOf('onClick={handlePush}', start)) + '</button>'.length;
  const expression = page.match(/const preparationBlocked = ([^\r\n]+)/)[1];
  const compiled = transformSync('const buttons = <>' + page.slice(start, end) + '</>; buttons;', { loader: 'jsx', format: 'cjs' }).code;
  for (const [closedLoopEnabled, ready, disabled, preparationSelectionChanged = false] of [[false, false, false], [true, false, true], [true, true, false], [true, true, true, true], [false, true, false, true]]) {
    const preparation = { checklist: { ready } };
    const preparationBlocked = vm.runInNewContext(expression, { closedLoopEnabled, preparation, preparationSelectionChanged });
    const buttons = vm.runInNewContext(compiled, { React, preparationBlocked, handleGenerateAIAnnualPlan() {}, handlePush() {},
      patient: { aiHealthSummary: { sections: {} } }, aiPlanLoading: false, pushing: false, dirty: false, planType: 'legacy', pushedAt: null });
    const html = renderToStaticMarkup(buttons);
    assert.equal((html.match(/disabled=""/g) || []).length, disabled ? 2 : 0);
  }
});
function handler(method, path, context) {
  const start = source.indexOf(`router.${method}('${path}', staffAuth, async (req, res) => {`);
  assert.ok(start > 0);
  const first = source.indexOf('async (req, res)', start);
  const end = source.indexOf('\n});', first);
  return vm.runInNewContext('(' + source.slice(first, end + 2) + ')', context);
}
function response() { return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
test('annual AI readiness applies only to selected customers; absent clinical summary still blocks legacy AI', async () => {
  for (const patientId of [other, selected]) {
    let checklistReads = 0;
    const run = handler('post', '/patients/:id/ai-annual-plan', {
      getVisiblePlanPatientIds: async () => [patientId], User: { findById: async () => ({ _id: patientId }) },
      require: name => {
        if (name.endsWith('/healthManagementRollout')) return { enabledForPatient: id => id === selected };
        if (name.endsWith('/annualPlanPreparation')) return { loadAnnualPlanPreparationChecklist: async () => { checklistReads++; return { checklist: { ready: false } }; } };
        assert.fail('unexpected dependency ' + name);
      },
    });
    const res = response();
    await run({ staff: { role: 'familyDoctor' }, params: { id: patientId }, body: {} }, res);
    assert.equal(res.code, patientId === selected ? 409 : 400);
    assert.equal(checklistReads, patientId === selected ? 1 : 0);
    assert.match(res.body.message, patientId === selected ? /准备清单/ : /AI健康信息/);
  }
});
test('annual publishing reads readiness only for persisted selected owner', async () => {
  for (const patientId of [other, selected]) {
    let checklistReads = 0, saves = 0;
    const plan = { patientId, save: async () => { saves++; throw Error('test stops before dispatch and notification'); } };
    const run = handler('patch', '/patients/:id/annual-plan/push', {
      getVisiblePlanPatientIds: async () => [patientId], AnnualPlan: { findOne: async () => plan },
      require: name => {
        if (name.endsWith('/healthManagementRollout')) return { enabledForPatient: id => id === selected };
        if (name.endsWith('/annualPlanPreparation')) return { loadAnnualPlanPreparationChecklist: async () => { checklistReads++; return { checklist: { ready: false } }; } };
        assert.fail('unexpected dependency ' + name);
      },
    });
    const res = response();
    await run({ staff: { role: 'familyDoctor' }, params: { id: patientId }, query: {} }, res);
    assert.equal(checklistReads, patientId === selected ? 1 : 0);
    assert.equal(saves, patientId === selected ? 0 : 1);
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
