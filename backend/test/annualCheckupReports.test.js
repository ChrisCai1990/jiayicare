const test = require('node:test')
const assert = require('node:assert/strict')
const sift = require('sift').default
const { createPreparationReportSync } = require('../src/utils/checkupPreparationReports')

function fixture() {
  const link = { _id: 'prep', patientId: 'patient', servicePlanId: 'service', status: 'active' }
  const service = { _id: 'service', patientId: 'patient', status: 'active', type: 'medical_assist', pushedAt: new Date(), content: { serviceDomain: 'annual_checkup', followUpPlans: [{ id: 'collect' }, { id: 'review' }] } }
  const schemes = ['collect', 'review'].map((id, i) => ({ _id: id, status: 'active', workflowStageKey: i ? 'result_review' : 'report_collection', executorRole: i ? 'familyDoctor' : 'healthManager' }))
  service.initiationSource = 'staff'; service.initiatedByStaff = 'staff'
  const collection = { _id: 'c', followUpSchemeId: 'collect', workflowKey: 'collect', status: 'completed', serviceChecklist: [{ serviceReviewed: true, collectionStatus: 'complete', reportIds: ['r'], itemChecks: [{ status: 'completed' }] }] }
  const review = { _id: 'v', followUpSchemeId: 'review', workflowKey: 'review', status: 'planned', assignedTo: 'advisor', dependsOnTaskId: 'c', updatedAt: new Date(), isBlocked: true }
  const tasks = [collection, review].map(x => Object.assign(x, { sourceHealthPlanId: 'service', patientId: 'patient', sourceType: 'health_plan', taskRole: 'executor' }))
  const reports = [{ _id: 'r', user: 'patient', audit_status: 'audited', planId: 'prep' }]
  const query = value => ({ lean: async () => value })
  const sync = createPreparationReportSync({
    Handoff: { exists: async filter => sift(filter)(link), findOne: filter => query(sift(filter)(link) ? link : null) },
    HealthPlan: { findById: () => query(service) }, FollowUpPlan: { find: filter => query(schemes.filter(sift(filter))) },
    MedicalReport: { find: filter => query(reports.filter(sift(filter))) }, User: { findById: () => query({ assignedFamilyDoctor: 'advisor' }) },
    Order: { findOne: () => query(null) },
    FollowUp: { find: filter => query(tasks.filter(sift(filter))), updateOne: async (filter, update) => {
      const row = tasks.find(sift(filter)); if (!row) return { modifiedCount: 0 }
      Object.assign(row, update.$set); return { modifiedCount: 1 }
    } },
  })
  return { link, service, schemes, collection, review, tasks, reports, sync }
}
test('explicit collected audited report unlocks only existing advisor task once', async () => {
  const f = fixture()
  assert.equal(await f.sync.reconcile(f.link), true)
  assert.equal(f.review.status, 'in_progress')
  assert.equal(f.tasks.length, 2)
  assert.equal(await f.sync.reconcile(f.link), false)
})
for (const [name, mutate] of Object.entries({
  'pending handoff': f => { f.link.status = 'linked_pending_activation' },
  'inactive service': f => { f.service.status = 'completed' },
  'pending service review': f => { f.service.content.aiStatus = 'pending' },
  'cancelled supervision': f => { f.service.supervisionStatus = 'cancelled' },
  'invalid service order': f => { f.service.sourceOrderId = 'inactive' },
  'missing initiation evidence': f => { delete f.service.initiatedByStaff },
  'collection unfinished': f => { f.collection.status = 'in_progress' },
  'missing report': f => { f.collection.serviceChecklist[0].reportIds.push('missing') },
  'unaudited report': f => { f.reports[0].audit_status = 'pending' },
  'another patient': f => { f.reports[0].user = 'other' },
  'old plan': f => { f.reports[0].planId = 'old' },
  'conflicting plan': f => { f.reports[0].sourceHealthPlanId = 'old' },
  'no explicit source': f => { delete f.reports[0].planId },
  'wrong order': f => { f.reports[0].sourceOrderId = 'old' },
  'duplicate task': f => { f.tasks.push({ ...f.review, _id: 'duplicate' }) },
  'wrong predecessor': f => { f.review.dependsOnTaskId = 'other' },
  'changed advisor': f => { f.review.assignedTo = 'old' },
  'completed review': f => { f.review.status = 'completed' },
  'cancelled review': f => { f.review.status = 'cancelled' },
})) test(name + ' does not activate', async () => {
  const f = fixture(); mutate(f)
  const before = JSON.stringify(f.tasks)
  assert.equal(await f.sync.reconcile(f.link), false)
  assert.equal(JSON.stringify(f.tasks), before)
})
test('unrelated plan is not handled; pending exact handoff remains isolated', async () => {
  const f = fixture()
  assert.deepEqual(await f.sync.forPlan('old', 'patient'), { handled: false, activated: false })
  f.link.status = 'activating'
  assert.deepEqual(await f.sync.forPlan('prep', 'patient'), { handled: true, activated: false })
})
