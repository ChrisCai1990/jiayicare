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
  const questionnaireSource = read('src/routes/questionnaire.js')
  const staffSource = read('src/routes/staff.js')
  assert.doesNotMatch(questionnaireSource, /draft\.autoItems\.length > 0/)
  assert.match(staffSource, /archiveVersionHistory/)
  assert.match(staffSource, /基础档案不可变，仅追加变化记录/)
  assert.doesNotMatch(staffSource, /\$set\[it\.path\]\s*=/)
  assert.match(staffSource, /mode: 'append_only'/)
  assert.match(read('src/models/User.js'), /archiveVersionHistory/)
})

test('checkup plan detail exposes order questionnaire needs and archive differences', () => {
  const backend = read('src/routes/staff.js')
  const frontend = read('../staff/src/pages/PlanModulesPage.jsx')
  const patientFrontend = read('../staff/src/pages/PatientDetailPage.jsx')
  assert.match(backend, /responsePlan\.checkupQuestionnaire/)
  assert.match(backend, /coreNeed:/)
  assert.match(backend, /baselineValue:/)
  assert.match(frontend, /本次问卷明细与档案变化/)
  assert.match(frontend, /基础档案：/)
  assert.match(frontend, /本次问卷：/)
  assert.match(patientFrontend, /本次体检服务需求/)
  assert.match(patientFrontend, /questionnaireResponses=\{qResponses\}/)
  assert.match(patientFrontend, /ARCHIVE_PATH_LABEL/)
})
