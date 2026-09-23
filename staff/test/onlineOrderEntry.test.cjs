const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/pages/PatientDetailPage.jsx'), 'utf8')

test('all planner online-order work items open their customer conversation', () => {
  const orderEntry = source.match(/if \(f\.sourceType === 'order' && staff\?\.role === 'healthPlanner'\) \{([\s\S]*?)\n      \}/)?.[1]
  assert.ok(orderEntry, 'planner order entry exists')
  assert.match(orderEntry, /openChat=1/)
  assert.match(orderEntry, /serviceBooking: f/)
  assert.doesNotMatch(orderEntry, /setTab\('plans'\)|autoMedicalAssist|genAIMedicalAssistPlan/)
})

test('confirming an online order never automatically generates a customer service plan', () => {
  assert.doesNotMatch(source, /autoMedicalAssist/)
  assert.match(source, /toast\(result\.message \|\| '服务信息已确认，订单已进入执行流程'\)/)
  assert.match(source, /'确认信息并流转'/)
})
