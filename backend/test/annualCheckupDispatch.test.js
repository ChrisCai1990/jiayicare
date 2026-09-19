const test = require('node:test')
const assert = require('node:assert/strict')
const sift = require('sift').default
const { createCheckupDispatch, buildDispatchTodos } = require('../src/utils/annualCheckupDispatch')
function fixture() {
  const plan = { _id: 'a', patientId: 'p', checkupPreparationAutoConfirmedAt: new Date('2026-09-01'), confirmedAt: new Date('2026-09-01'), pushedAt: new Date('2026-08-31'), reviewStatus: 'approved', moduleData: { annual_checkup: { date: '2026-10-03' } } }
  const patient = { _id: 'p', assignedFamilyDoctor: 'fd', assignedHealthPlanner: 'hp' }
  const gate = { allowed: true, anchor: plan.confirmedAt, access: { active: true, startDate: '2026-09-01', endDate: '2027-08-31' } }
  const tasks = [], indexes = [{ key: { annualDispatchKey: 1 }, unique: true, sparse: true }]
  let on = true, failSecond = false
  const q = value => ({ lean: async () => value })
  const models = { AnnualPlan: { findById: () => q(plan), updateOne: async (_, update) => Object.assign(plan, update.$set) }, User: { findById: () => q(patient) },
    FollowUp: { collection: { indexes: async () => indexes }, find: filter => q(tasks.filter(sift(filter))), exists: async filter => tasks.some(sift(filter)),
      updateOne: async (filter, update) => {
        if (failSecond && update.$setOnInsert.assignedTo === 'hp') throw Error('interruption')
        if (tasks.some(sift(filter))) return { upsertedCount: 0 }
        tasks.push(update.$setOnInsert); return { upsertedCount: 1 }
      } } }
  const sync = createCheckupDispatch(models, async () => gate, () => on).sync
  return { plan, patient, gate, tasks, indexes, run: (date = '2026-09-19T02:00:00Z') => sync(plan, new Date(date)), off: () => { on = false }, fail: value => { failSecond = value } }
}
test('due window dispatches two parallel roles once', async () => {
  const f = fixture(); assert.equal((await f.run()).created, 2); assert.equal((await f.run()).created, 0)
  assert.deepEqual(f.tasks.map(x => x.assignedTo), ['fd', 'hp']); assert.equal(new Set(f.tasks.map(x => x.annualDispatchKey)).size, 2)
})
test('half dispatch failure resumes only missing role', async () => {
  const f = fixture(); f.fail(true); assert.equal((await f.run()).created, 1); assert.equal(f.plan.checkupPreparationDispatch.issues[0].code, 'dispatch_failed')
  f.fail(false); assert.equal((await f.run()).created, 1); assert.equal(f.tasks.length, 2)
})
test('disabled, historical, premature, expired and inactive plans do not dispatch', async () => {
  const off = fixture(); off.off(); assert.equal((await off.run()).created, 0)
  const old = fixture(); delete old.plan.checkupPreparationAutoConfirmedAt; assert.equal((await old.run()).created, 0)
  for (const date of ['2026-09-18', '2026-10-04']) { const f = fixture(); assert.equal((await f.run(date)).created, 0) }
  const inactive = fixture(); inactive.gate.allowed = false; assert.equal((await inactive.run()).created, 0)
})
test('index absence prevents writes and records a recoverable issue', async () => {
  const f = fixture(); f.indexes.length = 0; assert.equal((await f.run()).created, 0); assert.equal(f.tasks.length, 0)
  assert.equal(f.plan.checkupPreparationDispatch.issues[0].code, 'dispatch_failed')
})
test('missing role dispatches other role; completed task never reopens; changed assignment is flagged', async () => {
  const f = fixture(); delete f.patient.assignedFamilyDoctor; await f.run(); assert.equal(f.tasks.length, 1)
  f.tasks[0].status = 'completed'; f.patient.assignedHealthPlanner = 'new'; await f.run()
  assert.equal(f.tasks[0].assignedTo, 'hp'); assert.equal(f.tasks[0].status, 'completed')
  assert.ok(f.plan.checkupPreparationDispatch.issues.some(x => x.code === 'existing_conflict'))
})
test('workbench issues are scoped; missing advisor routed to planner, normal inactivity silent', () => {
  const plan = { _id: 'a', patientId: { _id: 'p', assignedHealthPlanner: 'hp', assignedFamilyDoctor: 'fd' }, checkupPreparationDispatch: { issues: [
    { role: 'familyDoctor', code: 'missing_assignment', message: '缺顾问' }, { role: 'healthPlanner', code: 'service_inactive' }] } }
  assert.equal(buildDispatchTodos([plan], { _id: 'hp', role: 'healthPlanner' }).length, 1)
  assert.equal(buildDispatchTodos([plan], { _id: 'other', role: 'healthPlanner' }).length, 0)
  assert.equal(buildDispatchTodos([plan], { _id: 'fd', role: 'familyDoctor' }).length, 0)
})
