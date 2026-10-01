const test = require('node:test')
const assert = require('node:assert/strict')
test('plan presentation removes only template metadata and preserves clinical text', async () => {
  const { concretePlanText } = await import('../src/utils/annualItemLayout.mjs')
  const content = '由顾问确认目标（如每日1500ml），于2026-10-12跟进。'
  assert.equal(concretePlanText(`启动饮水指导（标准模板ID：4cfb3e8a11bccdc09c26b981），${content}`, '饮水指导'), content)
  assert.equal(concretePlanText('启动饮水指导并记录反馈', '饮水指导'), '启动饮水指导并记录反馈')
  assert.equal(concretePlanText('启动其他方案，保留医嘱', '饮水指导'), '启动其他方案，保留医嘱')
  assert.equal(concretePlanText(content), content)
})
test('template snapshots remain available separately without mutating definitions', async () => {
  const { annualItemLayout } = await import('../src/utils/annualItemLayout.mjs')
  const def = { fields: ['standardPlanName', 'standardContent', 'standardSchedule', 'matchReason', 'personalization', 'executionDate'].map(key => ({ key })) }
  const before = JSON.stringify(def)
  const result = annualItemLayout('personalized_followups', def)
  assert.deepEqual(result.templateFields.map(f => f.key), ['standardPlanName', 'standardContent', 'standardSchedule'])
  assert.deepEqual(result.fields.map(f => f.key), ['matchReason', 'personalization', 'executionDate'])
  assert.equal(result.fields[1].label, '具体方案')
  assert.equal(JSON.stringify(def), before)
  assert.equal(annualItemLayout('nutrition', def), def)
})
