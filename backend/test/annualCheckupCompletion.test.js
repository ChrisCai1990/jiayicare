const test = require('node:test')
const assert = require('node:assert/strict')
const sift = require('sift').default
const { createPreparationCompletion } = require('../src/utils/checkupPreparationCompletion')

function fixture() {
  const link = { _id: 'prep', servicePlanId: 's', patientId: 'p', annualPlanId: 'a', plannerTaskId: 'planner', status: 'active' }
  const service = { _id: 's', patientId: 'p', type: 'medical_assist', status: 'completed', initiationSource: 'staff', initiatedByStaff: 'staff',
    content: { serviceDomain: 'annual_checkup', workflowCompletedAt: new Date(), followUpPlans: [{ id: 'review' }, { id: 'final' }] } }
  const planner = { _id: 'planner', patientId: 'p', sourceAnnualPlanId: 'a', sourceType: 'annual_service', sourceScheduleKey: 'annual_checkup:2026-10-01:prepare:healthPlanner' }
  const manager = { _id: 'manager', patientId: 'p', sourceAnnualPlanId: 'a', sourceType: 'scheduled', sourceScheduleKey: 'annual_checkup:2026-10-01', taskRole: null, assignedTo: 'hm', status: 'planned', updatedAt: new Date() }
  const review = { _id: 'r', followUpSchemeId: 'review', workflowKey: 'review', taskRole: 'executor', executedContent: '评估结论' }
  const final = { _id: 'f', followUpSchemeId: 'final', workflowKey: 'final', taskRole: 'supervisor', dependsOnTaskId: 'r', executedContent: '验收结论' }
  for (const task of [review, final]) Object.assign(task, { patientId: 'p', sourceHealthPlanId: 's', sourceType: 'health_plan', status: 'completed' })
  const tasks = [planner, manager, review, final]
  const schemes = [{ _id: 'review', workflowStageKey: 'result_review', executorRole: 'familyDoctor' }, { _id: 'final', workflowStageKey: 'final_acceptance', workflowTaskRole: 'supervisor' }]
  const order = { _id: 'o', user: 'p', orderType: 'service', status: 'completed', fulfillmentStatus: 'completed', totalUnits: 1, usedUnits: 1 }
  const q = value => ({ lean: async () => value })
  let failFinalWrite = false, changeBeforeWrite = false, failOrderWrite = false
  const sync = createPreparationCompletion({
    Handoff: { updateOne: async (filter, update) => {
      if (failFinalWrite && update.$set.completion.status === 'completed') { failFinalWrite = false; throw Error('lost connection') }
      if (sift(filter)(link)) Object.assign(link, update.$set)
    } },
    HealthPlan: { findById: () => q(service), updateOne: async (filter, update) => {
      if (!sift(filter)(service)) return { modifiedCount: 0 }
      service.status = update.$set.status
      service.content.workflowCompletedAt = update.$set['content.workflowCompletedAt']
      return { modifiedCount: 1 }
    } }, Order: { findById: () => q(order), findOne: filter => q(sift(filter)(order) ? order : null),
      updateOne: async (filter, update) => {
        if (failOrderWrite) { failOrderWrite = false; throw Error('order write interrupted') }
        if (!sift(filter)(order)) return { modifiedCount: 0 }
        Object.assign(order, update.$set); return { modifiedCount: 1 }
      } },
    User: { findById: () => q({ assignedHealthManager: 'hm' }) },
    FollowUpPlan: { find: filter => q(schemes.filter(sift(filter))) },
    FollowUp: { findById: id => q(tasks.find(x => x._id === id)), find: filter => q(tasks.filter(sift(filter)).map(x => ({ ...x }))),
      updateOne: async (filter, update) => {
        if (changeBeforeWrite) manager.status = 'cancelled'
        const task = tasks.find(sift(filter)); if (!task) return { modifiedCount: 0 }
        Object.assign(task, update.$set); return { modifiedCount: 1 }
      } },
  })
  return { link, service, planner, manager, review, final, tasks, order, sync,
    failWrite: () => { failFinalWrite = true }, failOrder: () => { failOrderWrite = true }, change: () => { changeBeforeWrite = true } }
}
test('completed exact service closes only original annual manager followup, replay is inert', async () => {
  const f = fixture(); assert.equal(await f.sync.reconcile(f.link), true)
  assert.equal(f.manager.status, 'completed'); assert.equal(f.link.completion.status, 'completed')
  assert.equal(f.manager.checkupPreparationCompletion.finalTaskId, 'f')
  assert.equal(await f.sync.reconcile(f.link), false); assert.equal(f.tasks.length, 4)
})
test('lost final acknowledgement retries without rewriting task completion', async () => {
  const f = fixture(); f.failWrite(); await assert.rejects(f.sync.reconcile(f.link))
  const before = JSON.stringify(f.manager)
  assert.equal(await f.sync.reconcile(f.link), true); assert.equal(JSON.stringify(f.manager), before)
})
test('manual completion is preserved', async () => {
  const f = fixture(); f.manager.status = 'completed'; f.manager.completedBy = 'user'
  const before = JSON.stringify(f.manager); await f.sync.reconcile(f.link)
  assert.equal(JSON.stringify(f.manager), before); assert.equal(f.link.completion.preservedExistingCompletion, true)
})
test('concurrent cancellation wins', async () => {
  const f = fixture(); f.change(); assert.equal(await f.sync.reconcile(f.link), false)
  assert.equal(f.manager.status, 'cancelled'); assert.equal(f.link.completion.status, 'attention')
})
for (const [name, mutate] of Object.entries({
  'service unfinished': f => { f.service.status = 'active'; f.final.status = 'planned' },
  'wrong patient': f => { f.service.patientId = 'other' },
  'missing completion evidence': f => { delete f.service.content.workflowCompletedAt },
  'wrong annual': f => { f.planner.sourceAnnualPlanId = 'old' },
  'wrong frozen date': f => { f.planner.sourceScheduleKey = 'annual_checkup:2025-10-01:prepare:healthPlanner' },
  'duplicate manager task': f => { f.tasks.push({ ...f.manager, _id: 'duplicate' }) },
  'review unfinished': f => { f.review.status = 'in_progress' },
  'no final conclusion': f => { f.final.executedContent = '' },
  'wrong predecessor': f => { f.final.dependsOnTaskId = 'old' },
  'cancelled manager': f => { f.manager.status = 'cancelled' },
  'changed manager': f => { f.manager.assignedTo = 'other' },
  'pending review': f => { f.manager.aiStatus = 'pending' },
  'existing service link': f => { f.manager.serviceTracking = { targetId: 'other' } },
  'different completion proof': f => { f.manager.checkupPreparationCompletion = { handoffId: 'other' } },
  'refunded order': f => { f.service.sourceOrderId = 'o'; f.order.refundStatus = 'refunded' },
  'unconsumed order': f => { f.service.sourceOrderId = 'o'; f.order.usedUnits = 0 },
  'multiple units': f => { f.service.sourceOrderId = 'o'; f.order.totalUnits = 2 },
})) test(name + ' preserves manager task', async () => {
  const f = fixture(); mutate(f); const before = JSON.stringify(f.manager)
  assert.equal(await f.sync.reconcile(f.link), false); assert.equal(JSON.stringify(f.manager), before)
})
test('single unit fulfilled order permits closure', async () => {
  const f = fixture(); f.service.sourceOrderId = 'o'; assert.equal(await f.sync.reconcile(f.link), true)
})
test('exact multi-unit redemption closes this service and followup without closing or consuming order again', async () => {
  const f = fixture(); f.service.sourceOrderId = 'o'; f.service.status = 'active'
  Object.assign(f.order, { totalUnits: 3, usedUnits: 1, status: 'scheduled', paymentStatus: 'paid',
    redemptions: [{ servicePlanId: 's', handoffId: 'prep', finalTaskId: 'f', sequence: 1, redeemedBy: 'staff', redeemedAt: new Date() }] })
  const before = JSON.stringify(f.order)
  assert.equal(await f.sync.reconcile(f.link), true)
  assert.equal(f.service.status, 'completed'); assert.equal(f.manager.status, 'completed')
  assert.equal(JSON.stringify(f.order), before)
})
test('final acceptance persisted before service closure is recovered without executing tasks again', async () => {
  const f = fixture(); f.service.status = 'active'; delete f.service.content.workflowCompletedAt
  assert.equal(await f.sync.reconcile(f.link), true)
  assert.equal(f.service.status, 'completed'); assert.equal(f.manager.status, 'completed')
})
test('service closure survives interrupted order write; retry only finishes remaining steps', async () => {
  const f = fixture(); f.service.status = 'active'; f.service.sourceOrderId = 'o'
  Object.assign(f.order, { status: 'scheduled', usedUnits: 0, paymentStatus: 'paid', tradeStatus: 'paid', refundStatus: 'none', redemptions: [] })
  f.failOrder()
  await assert.rejects(f.sync.reconcile(f.link), /interrupted/)
  assert.equal(f.service.status, 'completed'); assert.equal(f.manager.status, 'planned')
  assert.equal(await f.sync.reconcile(f.link), true)
  assert.equal(f.order.usedUnits, 1); assert.equal(f.order.status, 'completed')
  assert.equal(await f.sync.reconcile(f.link), false)
})
