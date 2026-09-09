const test = require('node:test')
const assert = require('node:assert/strict')
const { followUpTaskPurposes } = require('../src/utils/medicalAssistRequirements')
const fs = require('node:fs')
const path = require('node:path')

test('medical assist purposes preserve explicit per-item outcomes', () => {
  const purposes = followUpTaskPurposes({ sourceHealthPlanId: { type: 'medical_assist', content: { moduleData: { tasks: { records: [
    { task: '请妇科医生开具盆腔MRI检查单' },
    { task: '预约消化内科专家完成胃肠镜复查' },
  ] } } } } })
  assert.deepEqual(purposes, ['请妇科医生开具盆腔MRI检查单', '预约消化内科专家完成胃肠镜复查'])
})

test('legacy newline tasks become separate purposes', () => {
  const purposes = followUpTaskPurposes({ sourceHealthPlanId: { type: 'medical_assist', content: { tasks: '1. 开具肾功能检查单\n2、打印并交付检查报告' } } })
  assert.deepEqual(purposes, ['开具肾功能检查单', '打印并交付检查报告'])
})

test('plan generation asks for concise verifiable purposes', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')
  assert.match(route, /一项只写一个可验收结果/)
  assert.match(route, /不强行凑数量/)
})

test('supervision issues reopen the paired executor task', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')
  assert.match(route, /taskRole === 'supervisor'.*status === 'in_progress'/)
  assert.match(route, /status: 'in_progress', serviceChecklist: followUp\.serviceChecklist/)
})
