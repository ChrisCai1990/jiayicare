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
