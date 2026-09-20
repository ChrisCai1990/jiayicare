const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = () => import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(__dirname, '../../staff/src/utils/checkupProgress.js'))).toString('base64'));
test('structured one-stop services do not depend on their display title', async () => {
  const { checkupServiceMode } = await load();
  for (const content of [{ serviceMode: 'one_stop' }, { serviceScene: 'checkup_one_stop' }]) {
    assert.equal(checkupServiceMode({ title: '隔离体检流程', content }), '体检一站式服务');
  }
  assert.equal(checkupServiceMode({ title: '既往体检一站式' }), '体检一站式服务');
  assert.equal(checkupServiceMode({ title: '普通检查' }), '单独体检服务');
});
test('explicit preparation links group one occurrence without changing item completion', async () => {
  const { groupCheckupPlans } = await load();
  const service = { _id: 'service', patientId: 'p', type: 'medical_assist', content: { serviceDomain: 'annual_checkup' }, status: 'completed', createdAt: '2026-09-20' };
  const prep = { _id: 'prep', patientId: 'p', type: 'annual_checkup', checkupServiceId: 'service', status: 'active', items: [{ completed: false }], createdAt: '2026-09-21' };
  const old = { _id: 'old', patientId: 'p', type: 'annual_checkup', createdAt: '2026-01-01' };
  for (const rows of [[prep, service, old], [service, prep, old]]) {
    const groups = groupCheckupPlans(rows);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].plan, service);
    assert.equal(groups[0].members.length, 2);
    assert.equal(prep.items[0].completed, false);
    assert.equal(prep.status, 'active');
  }
  assert.equal(groupCheckupPlans([service, { ...prep, patientId: 'other' }]).length, 2);
  assert.equal(groupCheckupPlans([service, { ...prep, checkupServiceId: null }]).length, 2);
});
test('API projection needs unique exact same-patient handoff and preserves source data', () => {
  const { projectCheckupLinks } = require('../src/utils/checkupPlanProjection');
  const plans = [{ _id: 'p', patientId: 'u', type: 'annual_checkup', status: 'active' },
    { _id: 's', patientId: 'u', type: 'medical_assist', content: { serviceDomain: 'annual_checkup' } }];
  const link = { _id: 'p', servicePlanId: 's', patientId: 'u' };
  assert.equal(projectCheckupLinks(plans, [link])[0].checkupServiceId, 's');
  assert.equal(plans[0].checkupServiceId, undefined);
  for (const links of [[], [link, link], [{ ...link, patientId: 'other' }], [{ ...link, servicePlanId: 'missing' }]]) {
    assert.equal(projectCheckupLinks(plans, links)[0].checkupServiceId, undefined);
  }
});
test('completed/cancelled services never ask customers to confirm again', async () => {
  const { checkupProgress } = await load();
  assert.match(checkupProgress({ _id: 'a', status: 'completed', pushedAt: 'date' }).title, /已完成/);
  assert.equal(checkupProgress({ _id: 'a', status: 'cancelled', pushedAt: 'date' }).stage, -1);
});
test('exact same service tasks override stale push hint, other services never advance it', async () => {
  const { checkupProgress } = await load();
  const plan = { _id: 'a', status: 'active', pushedAt: 'date' };
  const task = { sourceHealthPlanId: 'a', status: 'in_progress', isBlocked: false, followUpSchemeId: { workflowStageKey: 'result_review' } };
  assert.equal(checkupProgress(plan, [task]).stage, 5);
  assert.equal(checkupProgress(plan, [{ ...task, sourceHealthPlanId: 'b' }]).stage, 1);
  assert.equal(checkupProgress(plan, [{ ...task, isBlocked: true }]).stage, 1);
  assert.equal(checkupProgress(plan, [{ ...task, status: 'cancelled' }]).stage, 1);
});
test('report/task association uses explicit IDs, never report title or another year', async () => {
  const { belongsToCheckupPlan: match } = await load();
  const plan = { _id: 'a', content: { serviceInstanceId: 'service' } };
  assert.equal(match({ sourceHealthPlanId: { _id: 'service' } }, plan), true);
  assert.equal(match({ planId: 'a' }, plan), true);
  assert.equal(match({ title: '年度体检', sourceHealthPlanId: 'old' }, plan), false);
  assert.equal(match({ title: '年度体检' }, plan), false);
});
