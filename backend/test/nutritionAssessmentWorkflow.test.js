const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const mongoose = require('mongoose')

test('nutrition assessment: paid order goes to planner, annual ad hoc goes to advisor, manager books and dietitian completes', async t => {
  const ids = Object.fromEntries(['tenant', 'patient', 'advisor', 'planner', 'manager', 'nutritionist', 'request', 'plan', 'order'].map(key => [key, new mongoose.Types.ObjectId().toString()]))
  const staff = {
    advisor: { _id: ids.advisor, tenantId: ids.tenant, role: 'familyDoctor', name: '顾问' },
    planner: { _id: ids.planner, tenantId: ids.tenant, role: 'healthPlanner', name: '规划师' },
    manager: { _id: ids.manager, tenantId: ids.tenant, role: 'healthManager', name: '健管' },
    nutritionist: { _id: ids.nutritionist, tenantId: ids.tenant, role: 'nutritionist', name: '营养师' },
  }
  const authPath = require.resolve('../src/middleware/staffAuth')
  const originalAuth = require.cache[authPath]
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true,
    exports: (req, res, next) => { req.staff = staff[req.headers['x-test-role']]; next() } }
  const Request = require('../src/models/NutritionAssessmentRequest')
  const Config = require('../src/models/NutritionAssessmentConfig')
  const User = require('../src/models/User')
  const Admin = require('../src/models/Admin')
  const HealthPlan = require('../src/models/HealthPlan')
  const AnnualPlan = require('../src/models/AnnualPlan')
  const Order = require('../src/models/Order')
  const FollowUp = require('../src/models/FollowUp')
  const originalFollowUpUpdateMany = FollowUp.updateMany
  let closedOrderTasks = 0
  FollowUp.updateMany = async () => { closedOrderTasks += 1; return { modifiedCount: 1 } }
  const commissionPath = require.resolve('../src/utils/commissionSettlement')
  const originalCommission = require.cache[commissionPath]
  require.cache[commissionPath] = { id: commissionPath, filename: commissionPath, loaded: true,
    exports: { settleOrderCommission: async () => ({ created: [] }) } }
  let order = { _id: ids.order, user: ids.patient, tenantId: ids.tenant, orderType: 'service',
    serviceName: '营养评估服务', paymentStatus: 'paid', status: 'pending', totalUnits: 1, usedUnits: 0,
    redemptions: [], serviceItemsSnapshot: [], refundStatus: 'none' }
  let row = {
    _id: ids.request, tenantId: ids.tenant, patientId: ids.patient,
    advisorId: ids.advisor, managerId: ids.manager, nutritionistId: ids.nutritionist,
    source: 'nutrition_management', assessmentType: 'initial', reason: '近期体重变化需要评估',
    status: 'awaiting_booking', appointment: {}, assessment: {}, events: [{ action: 'requested', actorName: '顾问' }],
    __v: 0, createdAt: new Date(),
  }
  const originals = Object.fromEntries(['findOne', 'findOneAndUpdate', 'find', 'findById', 'exists', 'create', 'updateOne'].map(key => [key, Request[key]]))
  const userFindOne = User.findOne, adminFind = Admin.find, planFindOne = HealthPlan.findOne, annualExists = AnnualPlan.exists
  const orderOriginals = Object.fromEntries(['findOne', 'find', 'findById', 'findOneAndUpdate'].map(key => [key, Order[key]]))
  const configFindOne = Config.findOne
  const query = data => ({
    populate() { return this }, select() { return this }, sort() { return this }, limit() { return this },
    lean: async () => data, then(resolve, reject) { return Promise.resolve(data).then(resolve, reject) },
  })
  User.findOne = () => query({ assignedFamilyDoctor: ids.advisor, assignedHealthPlanner: ids.planner, assignedHealthManager: ids.manager, assignedNutritionist: ids.nutritionist })
  Admin.find = () => query([staff.manager, staff.nutritionist])
  let planStatus = 'draft'
  HealthPlan.findOne = () => query({ _id: ids.plan, status: planStatus, type: 'nutrition' })
  let annualActive = false
  AnnualPlan.exists = () => query(annualActive ? { _id: ids.plan } : null)
  Order.findOne = () => query(order)
  Order.find = () => query([order])
  Order.findById = () => query(order)
  Order.findOneAndUpdate = async (filter, update) => {
    if (order.status === 'completed' || order.usedUnits) return null
    order = { ...order, ...update.$set, redemptions: [...order.redemptions, update.$push.redemptions] }
    return order
  }
  Request.exists = () => query(null)
  Request.create = async data => { row = { _id: ids.request, ...data, status: 'awaiting_booking', appointment: {}, assessment: {}, __v: 0, createdAt: new Date() }; return row }
  Request.findOne = async filter => String(filter._id) === ids.request ? row : null
  Request.findOneAndUpdate = async (filter, update) => {
    if (row.status !== filter.status || filter.__v !== undefined && row.__v !== filter.__v) return null
    row = { ...row, ...update.$set, __v: row.__v + (update.$inc?.__v || 0), events: [...row.events, update.$push.events] }
    return row
  }
  Request.find = filter => query(filter.status?.$in || !filter.status ? [row] : row.status === filter.status ? [row] : [])
  Request.findById = () => query(row)
  Request.updateOne = async (_filter, update) => { row = { ...row, ...update.$set }; return { modifiedCount: 1 } }
  let config = { enabled: true, onlineEnabled: true, offlineEnabled: true }
  Config.findOne = () => query(config)
  const app = express()
  app.use(express.json())
  app.use('/nutrition-assessments', require('../src/routes/nutritionAssessments'))
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)) })
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    for (const [key, value] of Object.entries(originals)) Request[key] = value
    Config.findOne = configFindOne
    User.findOne = userFindOne
    Admin.find = adminFind
    HealthPlan.findOne = planFindOne
    AnnualPlan.exists = annualExists
    for (const [key, value] of Object.entries(orderOriginals)) Order[key] = value
    FollowUp.updateMany = originalFollowUpUpdateMany
    if (originalCommission) require.cache[commissionPath] = originalCommission
    else delete require.cache[commissionPath]
    if (originalAuth) require.cache[authPath] = originalAuth
    else delete require.cache[authPath]
  })
  const call = async (role, path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/nutrition-assessments${path}`, {
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-test-role': role },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, body: await response.json() }
  }
  assert.equal((await call('advisor', '/', { patientId: ids.patient, source: 'paid_order', sourceOrderId: ids.order, reason: '近期体重变化需要评估' })).status, 403)
  assert.equal((await call('planner', `/eligible-orders?patientId=${ids.patient}`)).body.data.length, 1)
  order.paymentStatus = 'unpaid'
  assert.equal((await call('planner', '/', { patientId: ids.patient, source: 'paid_order', sourceOrderId: ids.order, reason: '近期体重变化需要评估' })).status, 409)
  order.paymentStatus = 'paid'
  assert.equal((await call('planner', '/', { patientId: ids.patient, source: 'paid_order', sourceOrderId: ids.order, reason: '近期体重变化需要评估', focus: '体重与饮食结构' })).status, 201)
  assert.equal(row.source, 'paid_order')
  assert.equal(row.plannerId, ids.planner)
  assert.equal(row.advisorId, null)
  assert.equal(row.managerId, ids.manager)
  assert.equal((await call('nutritionist', `/${ids.request}/complete`, { summary: '营养评估尚未预约', recommendations: '建议记录饮食' })).status, 409)
  assert.equal((await call('nutritionist', `/${ids.request}/booking`, { at: '2099-01-01T10:00:00Z', mode: 'online', meetingRoom: '123' })).status, 403)
  assert.equal((await call('manager', `/${ids.request}/booking`, { at: '2099-01-01T10:00:00Z', mode: 'online' })).status, 400)
  config = { ...config, onlineEnabled: false }
  assert.equal((await call('manager', `/${ids.request}/booking`, { at: '2099-01-01T10:00:00Z', mode: 'online', meetingRoom: '腾讯会议 123' })).status, 409)
  config = { ...config, onlineEnabled: true }
  assert.equal((await call('manager', `/${ids.request}/booking`, { at: '2099-01-01T10:00:00Z', mode: 'online', meetingRoom: '腾讯会议 123' })).status, 200)
  assert.equal(row.status, 'booked')
  order.refundStatus = 'requested'
  assert.equal((await call('manager', `/${ids.request}/booking`, { at: '2099-01-02T10:30:00Z', mode: 'offline', store: '中心门店' })).status, 409)
  order.refundStatus = 'none'
  assert.equal((await call('manager', `/${ids.request}/booking`, { at: '2099-01-02T10:30:00Z', mode: 'offline', store: '中心门店' })).status, 200)
  assert.match(row.events.at(-1).note, /原预约.*腾讯会议 123.*中心门店/)
  assert.equal((await call('nutritionist', `/${ids.request}/complete`, { summary: '饮食结构需要调整，建议逐步增加蔬菜和蛋白质', recommendations: '两周后复评' })).status, 200)
  assert.equal(row.status, 'completed')
  assert.equal(row.orderSettlementStatus, 'completed')
  assert.equal(order.status, 'completed')
  assert.equal(order.usedUnits, 1)
  assert.equal(String(order.redemptions[0].nutritionAssessmentRequestId), ids.request)
  assert.equal(closedOrderTasks, 1)
  assert.equal((await call('nutritionist', `/${ids.request}/complete`, {})).status, 200)
  assert.equal(order.redemptions.length, 1)
  const plannerView = await call('planner', `/?patientId=${ids.patient}`)
  assert.equal(plannerView.status, 200)
  assert.equal(plannerView.body.data[0].assessment.summary, '饮食结构需要调整，建议逐步增加蔬菜和蛋白质')
  assert.deepEqual(plannerView.body.data[0].events.map(item => item.action), ['requested', 'booked', 'rescheduled', 'completed'])
  assert.equal((await call('advisor', '/', { patientId: ids.patient, source: 'nutrition_management', reason: '年度管理期间临时需要营养评估' })).status, 409)
  assert.equal((await call('planner', '/', { patientId: ids.patient, source: 'nutrition_management', reason: '年度管理期间临时需要营养评估' })).status, 403)
  annualActive = true
  assert.equal((await call('advisor', '/', { patientId: ids.patient, source: 'nutrition_management', reason: '年度管理期间临时需要营养评估' })).status, 201)
  assert.equal(row.sourceOrderId, null)
  assert.equal(row.advisorId, ids.advisor)
  const reassessment = { patientId: ids.patient, source: 'nutrition_plan', sourcePlanId: ids.plan, reason: '干预方案执行后需要复评' }
  assert.equal((await call('advisor', '/', reassessment)).status, 409)
  planStatus = 'active'
  assert.equal((await call('advisor', '/', reassessment)).status, 201)
  assert.equal(row.assessmentType, 'reassessment')
  assert.equal(String(row.sourcePlanId), ids.plan)
})

