const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8')

test('a stale doctor task cannot generate another checkup draft after customer confirmation', () => {
  const source = read('components/ServiceTasksPanel.jsx')
  assert.match(source, /const openTask = async \(task\)/)
  assert.match(source, /getServiceTasks\(\{ status: 'active', includeFuture: '1', limit: 100 \}\)/)
  assert.match(source, /!activeItems\.some\(item => String\(item\._id\) === String\(task\._id\)\)/)
  assert.match(source, /serviceView=checkup`\)\s*return/)
})

test('confirmed checkup workspace explains the handoff instead of asking the doctor to redesign', () => {
  const source = read('pages/PatientDetailPage.jsx')
  assert.match(source, /const customerConfirmed = !!currentPlan\?\.confirmedAt/)
  assert.match(source, /客户已确认体检方案，已转健康规划师预约/)
  assert.match(source, /健康顾问无需重复生成方案/)
})
