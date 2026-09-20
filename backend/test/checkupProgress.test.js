const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = () => import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(__dirname, '../../staff/src/utils/checkupProgress.js'))).toString('base64'));
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
