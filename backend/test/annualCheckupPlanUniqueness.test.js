const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')

test('AI annual checkup generation reuses the plan from the current checkup service cycle', () => {
  assert.match(source, /const currentCheckupService = serviceCandidates\.find\(isCheckupService\)/)
  assert.match(source, /createdAt: \{ \$gte: currentCheckupService\.createdAt \}/)
  assert.match(source, /existingPlans\.find\(plan => plan\.confirmedAt\)/)
  assert.match(source, /existingPlans\.find\(plan => plan\.pushedAt\)/)
  assert.match(source, /reused: true/)
  assert.match(source, /本次体检方案已由客户确认，已打开正式方案/)
})
