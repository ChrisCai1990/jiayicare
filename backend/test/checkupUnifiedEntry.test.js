const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('staff-initiated checkup selects an Admin-published workflow product', () => {
  const backend = read('src/routes/staff.js')
  const frontend = read('../staff/src/pages/PatientDetailPage.jsx')
  assert.match(backend, /router\.get\('\/workflow-products'/)
  assert.match(backend, /'serviceWorkflow\.key': key/)
  assert.match(frontend, /执行服务流程（来自 Admin）/)
  assert.match(frontend, /getWorkflowProducts\('checkup'\)/)
  assert.match(frontend, /generateAIAnnualCheckupPlan\(id, templateId, briefNote, productId, desiredServiceDate, serviceRequirements\)/)
  assert.match(frontend, /期望服务时间 \*/)
  assert.match(frontend, /具体服务需求 \*/)
  assert.match(frontend, /Admin 已发布流程/)
  assert.match(backend, /请选择有效的期望服务时间/)
})

test('staff and order entries converge on one checkup service instance', () => {
  const route = read('src/routes/staff.js')
  const helper = read('src/utils/checkupServiceInstance.js')
  const flow = read('src/utils/checkupOneStopFlow.js')
  assert.match(route, /ensureStaffInitiatedCheckupService/)
  assert.match(route, /serviceInstanceId: currentCheckupService\?\._id/)
  assert.match(helper, /sourceType: 'staff_initiated'/)
  assert.match(helper, /serviceWorkflowSnapshot: workflowSnapshot/)
  assert.match(flow, /findCheckupServicePlan\(patientId, serviceInstanceId\)/)
})

test('staff-initiated service copies the published Admin module snapshot', () => {
  const helper = read('src/utils/checkupServiceInstance.js')
  assert.match(helper, /'serviceWorkflow\.key': CHECKUP_WORKFLOW_KEY/)
  assert.match(helper, /workflowModules: modules/)
  assert.match(helper, /workflowModuleDecisions: modules\.filter\(item => item\.mode === 'conditional'\)/)
})

test('generic medical-assist entry excludes checkup workflow templates', () => {
  const route = read('src/routes/staff.js')
  assert.match(route, /type === 'medical_assist'/)
  assert.match(route, /\['annual_checkup', 'checkup'\]\.includes\(tpl\.content\?\.serviceDomain\)/)
})

test('V13 keeps the Admin template display aligned with the product workflow', () => {
  const migration = read('src/scripts/migrateCheckupTemplateWorkflowV13.js')
  assert.match(migration, /Product\.serviceWorkflow/)
  assert.match(migration, /'content\.followUpPlans': linkedPlans/)
  assert.match(migration, /maintenance_backups/)
})
