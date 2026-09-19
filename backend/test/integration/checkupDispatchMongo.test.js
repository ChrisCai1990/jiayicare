// Explicit opt-in; NEVER loads .env or uses the application's MONGODB_URI.
// Writes only a fresh local test database, retained for inspection after the run.
const test = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const { randomUUID } = require('node:crypto')
const { createCheckupDispatch } = require('../../src/utils/annualCheckupDispatch')

test('real MongoDB: checkup preparation dispatch concurrency and partial recovery', {
  skip: process.env.RUN_CHECKUP_LOCAL_MONGO_TEST !== 'true', timeout: 45000,
}, async t => {
  const port = Number(process.env.CHECKUP_TEST_MONGO_PORT || 27017)
  assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'invalid local test port')
  const dbName = `jiayicare_checkup_test_${randomUUID().replaceAll('-', '')}`
  const connection = await mongoose.createConnection(`mongodb://127.0.0.1:${port}/${dbName}`, {
    serverSelectionTimeoutMS: 3000, autoIndex: false, autoCreate: false,
  }).asPromise()
  t.after(async () => { await connection.close() })
  t.diagnostic(`Isolated local database retained: ${dbName}`)
  const AnnualPlan = connection.model('AnnualPlan', require('../../src/models/AnnualPlan').schema.clone())
  const User = connection.model('User', require('../../src/models/User').schema.clone())
  const FollowUp = connection.model('FollowUp', require('../../src/models/FollowUp').schema.clone())
  const now = new Date('2026-09-19T02:00:00Z')
  const patientId = new mongoose.Types.ObjectId(), advisorId = new mongoose.Types.ObjectId(), plannerId = new mongoose.Types.ObjectId()
  await User.collection.insertOne({ _id: patientId, assignedFamilyDoctor: advisorId, assignedHealthPlanner: plannerId })
  const base = { patientId, checkupPreparationAutoConfirmedAt: now, confirmedAt: new Date('2026-09-01'),
    pushedAt: new Date('2026-08-31'), reviewStatus: 'approved', moduleData: { annual_checkup: { date: '2026-10-03' } }, updatedAt: now }
  const newPlan = async () => {
    const plan = { ...base, _id: new mongoose.Types.ObjectId() }
    await AnnualPlan.collection.insertOne(plan)
    return plan
  }
  const gate = async plan => ({ allowed: true, anchor: plan.confirmedAt,
    access: { active: true, startDate: '2026-09-01', endDate: '2027-08-31' } })
  const dispatcher = createCheckupDispatch({ AnnualPlan, User, FollowUp }, gate, () => true)
  await FollowUp.createCollection()

  await t.test('missing real index blocks all task writes', async () => {
    const plan = await newPlan()
    const result = await dispatcher.sync(plan, now)
    assert.equal(result.created, 0)
    assert.equal(await FollowUp.countDocuments({ sourceAnnualPlanId: plan._id }), 0)
    assert.equal((await AnnualPlan.findById(plan._id).lean()).checkupPreparationDispatch.issues[0].code, 'dispatch_failed')
  })
  // Index creation is restricted to the randomly named, locally created fixture database.
  assert.equal(connection.name, dbName)
  await FollowUp.collection.createIndex({ annualDispatchKey: 1 }, { unique: true, sparse: true })
  await t.test('20 overlapping dispatches create exactly two role tasks', async () => {
    const plan = await newPlan()
    await Promise.all(Array.from({ length: 20 }, () => dispatcher.sync(plan, now)))
    const rows = await FollowUp.find({ sourceAnnualPlanId: plan._id }).lean()
    assert.equal(rows.length, 2)
    assert.equal(new Set(rows.map(x => String(x.assignedTo))).size, 2)
    assert.equal(new Set(rows.map(x => x.annualDispatchKey)).size, 2)
    assert.ok(rows.every(x => x.status === 'planned' && x.isBlocked === false))
  })
  await t.test('failure after first role persists; retry fills only second role', async () => {
    const plan = await newPlan()
    const interrupted = { collection: FollowUp.collection, find: (...args) => FollowUp.find(...args), exists: (...args) => FollowUp.exists(...args),
      updateOne: (filter, update, options) => {
        if (String(update.$setOnInsert.assignedTo) === String(plannerId)) throw Error('injected interruption')
        return FollowUp.updateOne(filter, update, options)
      } }
    await createCheckupDispatch({ AnnualPlan, User, FollowUp: interrupted }, gate, () => true).sync(plan, now)
    assert.equal(await FollowUp.countDocuments({ sourceAnnualPlanId: plan._id }), 1)
    await dispatcher.sync(plan, now)
    assert.equal(await FollowUp.countDocuments({ sourceAnnualPlanId: plan._id }), 2)
  })
  await t.test('completed/cancelled role tasks remain unchanged on replay', async () => {
    const plan = await newPlan(); await dispatcher.sync(plan, now)
    await FollowUp.updateMany({ sourceAnnualPlanId: plan._id, assignedTo: advisorId }, { $set: { status: 'completed' } })
    await FollowUp.updateMany({ sourceAnnualPlanId: plan._id, assignedTo: plannerId }, { $set: { status: 'cancelled' } })
    const before = await FollowUp.find({ sourceAnnualPlanId: plan._id }).sort({ _id: 1 }).lean()
    await dispatcher.sync(plan, now)
    assert.deepEqual(await FollowUp.find({ sourceAnnualPlanId: plan._id }).sort({ _id: 1 }).lean(), before)
  })
})
