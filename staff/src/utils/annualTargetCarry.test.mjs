import test from 'node:test'
import assert from 'node:assert/strict'
import { carryAnnualTargets } from './annualTargetCarry.mjs'

test('未发布草稿承接新增筛查事项并保留顾问编辑，营养评估保持参与', () => {
  const modules = { management_targets: { records: [{ issueId: 'management_issue:1', sourceGoal: '持续管理或观察',
    goal: '顾问调整后的目标', focus: '顾问调整后的重点', nutritionRelevant: false }] } }
  const confirmed = [
    { issueId: 'management_issue:1', sourceGoal: '营养评估', sourceTitle: '脂肪肝', goal: '来源目标', focus: '来源重点', nutritionRelevant: true },
    { issueId: 'management_issue:2', sourceGoal: '营养评估', sourceTitle: '体重异常', goal: '第二目标', focus: '第二重点', nutritionRelevant: true },
  ]
  const result = carryAnnualTargets(modules, confirmed)
  assert.equal(result.changed, true)
  assert.equal(result.modules.management_targets.records.length, 2)
  assert.equal(result.modules.management_targets.records[0].goal, '顾问调整后的目标')
  assert.equal(result.modules.management_targets.records[0].nutritionRelevant, true)
  assert.equal(result.modules.management_targets.records[1].sourceTitle, '体重异常')
  assert.equal(carryAnnualTargets(result.modules, confirmed).changed, false)
})

test('筛查决定直接进入执行板块，重复加载不新增，改为营养评估后移除旧草稿', () => {
  const review = { key: 'abnormal_followup', record: { sourceIds: ['review:1'], items: '胸部CT', reviewItems: ['胸部CT'], time: '2027-02-01' } }
  const nutrition = { issueId: 'review:2', sourceTitle: '脂肪肝', sourceGoal: '营养评估', nutritionRelevant: true }
  const source = [{ issueId: 'review:1', sourceGoal: '定期复查', sourceTitle: '肺结节' }, nutrition]
  const first = carryAnnualTargets({}, source, [review])
  assert.equal(first.modules.abnormal_followup.records[0].reviewItems[0], '胸部CT')
  assert.equal(first.modules.nutrition_assessment.enabled, true)
  assert.equal(carryAnnualTargets(first.modules, source, [review]).changed, false)
  const edited = { ...first.modules, abnormal_followup: { records: [{ ...first.modules.abnormal_followup.records[0], hospital: '顾问确认医院' }] } }
  assert.equal(carryAnnualTargets(edited, source, [review]).modules.abnormal_followup.records[0].hospital, '顾问确认医院')
  const converted = carryAnnualTargets(edited, [{ ...source[0], sourceGoal: '营养评估' }, nutrition], [])
  assert.equal(converted.modules.abnormal_followup.records.length, 0)
  assert.equal(converted.modules.nutrition_assessment.enabled, true)
})
