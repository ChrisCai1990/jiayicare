const test = require('node:test');
const assert = require('node:assert/strict');
const { confirmPublishedAnnualPlan } = require('../src/utils/annualPlanConfirmation');
test('未发布、未审核及退回方案不能由客户确认', async () => {
  for (const patch of [{ pushedAt: null, reviewStatus: 'approved' }, { pushedAt: new Date(), reviewStatus: 'pending' }, { pushedAt: new Date(), reviewStatus: 'rejected' }]) {
    let saved = false;
    await assert.rejects(confirmPublishedAnnualPlan({ ...patch, save: async () => { saved = true; } }), { statusCode: 409 });
    assert.equal(saved, false);
  }
});
test('已审核发布方案首次确认冻结，重复确认不重写日期', async () => {
  let saves = 0;
  const plan = { pushedAt: new Date(), reviewStatus: 'approved', save: async () => { saves++; } };
  const first = new Date('2026-09-19T00:00:00Z');
  await confirmPublishedAnnualPlan(plan, first);
  await confirmPublishedAnnualPlan(plan, new Date('2026-10-01T00:00:00Z'));
  assert.equal(plan.confirmedAt, first); assert.equal(plan.frozenAt, first); assert.equal(saves, 1);
});
test('历史已确认且已审核发布方案仅补冻结标记', async () => {
  const first = new Date('2026-01-01T00:00:00Z'); let saves = 0;
  const plan = { pushedAt: first, reviewStatus: 'approved', confirmedAt: first, save: async () => { saves++; } };
  await confirmPublishedAnnualPlan(plan);
  assert.equal(plan.frozenAt, first); assert.equal(saves, 1);
});
