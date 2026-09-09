const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('Admin can bind one active questionnaire to a checkup product workflow', () => {
  assert.match(read('src/models/Product.js'), /questionnaireId:.*DynamicQuestionnaire/)
  assert.match(read('src/routes/admin.js'), /关联问卷不存在或未启用/)
  assert.match(read('../admin/src/pages/settings/SupplyWorkflowConfigPage.jsx'), /下单自动问卷/)
})

test('each checkup order creates an order-scoped questionnaire assignment', () => {
  const source = read('src/routes/services.js')
  assert.match(source, /const PushRecord = require\('\.\.\/models\/PushRecord'\)/)
  assert.match(source, /serviceWorkflow\?\.key === 'checkup'/)
  assert.match(source, /sourceOrderId: order\._id/)
  assert.match(source, /每笔订单独立推送一次/)
})

test('questionnaire push failures never block the payment flow', () => {
  const source = read('src/routes/services.js')
  assert.match(source, /\[checkup-questionnaire\] push failed; payment flow continues/)
  assert.match(source, /status: 'push_failed'/)
  assert.ok(source.indexOf("status: 'push_failed'") < source.indexOf('wechatPay.createJsapiPayment'))
})

test('questionnaire submission is scoped to its push assignment and linked back to the order and plan', () => {
  const source = read('src/routes/questionnaire.js')
  assert.match(source, /assignmentId/)
  assert.match(source, /兼容尚未升级、不会回传 assignmentId 的旧客户端/)
  assert.match(source, /availableAssignments\.length === 1/)
  assert.match(source, /存在多笔待填写体检订单/)
  assert.match(source, /pushRecordId: assignment\?\._id/)
  assert.match(source, /Order\.findByIdAndUpdate/)
  assert.match(source, /HealthPlan\.updateMany/)
})

test('mapped questionnaire answers wait for review and confirmed changes retain archive versions', () => {
  assert.doesNotMatch(read('src/routes/questionnaire.js'), /draft\.autoItems\.length > 0/)
  assert.match(read('src/routes/staff.js'), /archiveVersionHistory/)
  assert.match(read('src/models/User.js'), /archiveVersionHistory/)
})
