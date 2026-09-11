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
  assert.match(frontend, /generateAIAnnualCheckupPlan\(id, templateId, briefNote, productId\)/)
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
