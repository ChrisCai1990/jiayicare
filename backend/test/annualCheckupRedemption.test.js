const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCheckupRedemption, hasExactRedemption } = require('../src/utils/checkupRedemptionSource')
const { saveCheckupRedemption } = require('../src/utils/checkupRedemptionSource')
const sift = require('sift').default
function fixture() {
  const order = { _id: 'o', user: 'p', paymentStatus: 'paid', redemptions: [] }
  const service = { _id: 's', status: 'active', content: { followUpPlanId: 'scheme' } }
  const links = [{ _id: 'link', servicePlanId: 's', status: 'active' }]
  const schemes = [{ _id: 'f', workflowStageKey: 'final_acceptance', workflowTaskRole: 'supervisor' }, { _id: 'r', workflowStageKey: 'result_review', executorRole: 'familyDoctor' }]
  const tasks = [{ _id: 'ft', followUpSchemeId: 'f', workflowKey: 'f', taskRole: 'supervisor', executedContent: '验收', dependsOnTaskId: 'rt' }, { _id: 'rt', followUpSchemeId: 'r', workflowKey: 'r', taskRole: 'executor', executedContent: '评估' }]
  const q = value => ({ lean: async () => value })
  const models = { HealthPlan: { find: () => q([service]) }, Handoff: { find: () => q(links) }, FollowUpPlan: { find: () => q(schemes) }, FollowUp: { find: () => q(tasks) }, User: { findById: () => q({ assignedHealthPlanner: 'hp' }) } }
  return { order, service, links, tasks, models, run: actor => resolveCheckupRedemption(order, actor || { _id: 'hp', role: 'healthPlanner' }, models) }
}
test('unique completed acceptance supplies exact source without another confirmation', async () => {
  const f = fixture(); assert.deepEqual(await f.run(), { servicePlanId: 's', handoffId: 'link', finalTaskId: 'ft' })
})
test('unrelated order keeps original workflow', async () => {
  const f = fixture(); f.links.length = 0; assert.equal(await f.run(), null)
})
for (const [name, change] of Object.entries({
  duplicate: f => f.links.push({ ...f.links[0], _id: 'other' }),
  redeemed: f => f.order.redemptions.push({ servicePlanId: 's' }),
  cancelled: f => { f.service.status = 'cancelled' },
  unpaid: f => { f.order.paymentStatus = 'unpaid' },
  refunded: f => { f.order.refundStatus = 'partially_refunded' },
  'no conclusion': f => { f.tasks[0].executedContent = '' },
  'wrong dependency': f => { f.tasks[0].dependsOnTaskId = 'old' },
  'inactive link': f => { f.links[0].status = 'activating' },
  'multiple items': f => { f.order.serviceItemsSnapshot = [{ key: 'one' }, { key: 'two' }] },
})) test(name + ' cannot infer a redemption', async () => {
  const f = fixture(); change(f); await assert.rejects(f.run(), { statusCode: 409 })
})
test('other staff cannot redeem prepared checkup', async () => {
  await assert.rejects(fixture().run({ _id: 'other', role: 'healthPlanner' }), { statusCode: 403 })
})
test('exact multi-unit proof validates only its own service, final task and sequence', () => {
  const row = { servicePlanId: 's', handoffId: 'l', finalTaskId: 'f', sequence: 1, redeemedBy: 'staff', redeemedAt: new Date() }
  const order = { paymentStatus: 'paid', totalUnits: 3, usedUnits: 1, status: 'scheduled', redemptions: [row] }
  const check = () => hasExactRedemption(order, { _id: 's' }, { _id: 'l' }, { _id: 'f' })
  assert.equal(check(), true)
  row.finalTaskId = 'other'; assert.equal(check(), false); row.finalTaskId = 'f'
  order.redemptions.push({ ...row }); assert.equal(check(), false)
})
test('concurrent redemption only writes one increment and one source proof', async () => {
  const original = { _id: 'o', updatedAt: new Date(), status: 'scheduled', usedUnits: 0, paymentStatus: 'paid', redemptions: [] }
  const stored = { ...original }
  const proposed = { ...original, usedUnits: 1, redemptions: [{ servicePlanId: 's', sequence: 1 }] }
  const model = { updateOne: async (filter, update) => {
    if (!sift(filter)(stored)) return { modifiedCount: 0 }
    Object.assign(stored, update.$set); return { modifiedCount: 1 }
  } }
  const result = await Promise.all([1, 2].map(() => saveCheckupRedemption(model, proposed, { servicePlanId: 's' }, original)))
  assert.equal(result.reduce((sum, x) => sum + x.modifiedCount, 0), 1)
  assert.equal(stored.usedUnits, 1); assert.equal(stored.redemptions.length, 1)
})
test('concurrent refund blocks redemption even before timestamp changes', async () => {
  const original = { _id: 'o', status: 'scheduled', usedUnits: 0, refundStatus: 'none', paymentStatus: 'paid' }
  const model = { updateOne: async filter => ({ modifiedCount: sift(filter)({ ...original, refundStatus: 'processing' }) ? 1 : 0 }) }
  assert.equal((await saveCheckupRedemption(model, { ...original, usedUnits: 1 }, { servicePlanId: 's' }, original)).modifiedCount, 0)
})
