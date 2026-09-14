import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/pages/PatientDetailPage.jsx', import.meta.url), 'utf8')

test('planner chat scrolls to the measured bottom after layout and keeps clearance above composer', () => {
  assert.match(source, /top: el\.scrollHeight/)
  assert.match(source, /requestAnimationFrame\(\(\) => requestAnimationFrame\(scroll\)\)/)
  assert.match(source, /padding: '16px 16px 72px'/)
  assert.match(source, /height: '92vh'[\s\S]{0,250}overflow: 'hidden'/)
  assert.doesNotMatch(source, /top: 99999/)
})

test('planning chat can finish the planning task or push an existing service product in place', () => {
  assert.match(source, /客户暂无需求，结束本次规划/)
  assert.match(source, /客户有需求，推荐后续服务/)
  assert.match(source, /staffAPI\.pushProduct\(product\.id, \{ patientIds: \[patientId\] \}\)/)
  assert.match(source, /planningOutcome: 'no_additional_service'/)
  assert.match(source, /planningOutcome: 'additional_service_needed'/)
})
