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

test('checkup workspace distinguishes the latest plan from prior history', () => {
  assert.match(patient, /本次 1 · 既往 \$\{Math\.max\(0, categoryPlans\.length - 1\)\}/)
  assert.match(patient, /查看最新方案与执行/)
  assert.match(patient, /既往体检（不含上方本次方案）/)
  assert.match(patient, /客户确认：\{formatPlanMoment\(currentPlan\.confirmedAt\)\}/)
  assert.match(patient, /本次方案完成后仍保留在上方/)
})
