const test = require('node:test')
const assert = require('node:assert/strict')
const { followUpTaskPurposes } = require('../src/utils/medicalAssistRequirements')

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
