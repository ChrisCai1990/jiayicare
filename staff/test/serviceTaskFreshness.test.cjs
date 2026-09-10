const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const panel = fs.readFileSync(path.join(__dirname, '../src/components/ServiceTasksPanel.jsx'), 'utf8')
const patient = fs.readFileSync(path.join(__dirname, '../src/pages/PatientDetailPage.jsx'), 'utf8')

test('service task panel refreshes after cross-role handoff and shows exact creation time', () => {
  assert.match(panel, /window\.setInterval\(refreshIfVisible, 15000\)/)
  assert.match(panel, /addEventListener\('focus', refreshIfVisible\)/)
  assert.match(panel, /创建：\{new Date\(task\.createdAt\)\.toLocaleString/)
})

test('checkup history shows each plan creation date and time', () => {
  assert.match(patient, /const createdText = plan\.createdAt \? new Date\(plan\.createdAt\)\.toLocaleString/)
  assert.match(patient, /创建：\{createdText\}/)
})
