import test from 'node:test'
import assert from 'node:assert/strict'
import { carryAnnualTargets } from './annualTargetCarry.mjs'

test('血压和体重作为独立监测草稿承接，调整时间和取消选项同步更新', () => {
  const targets = [{ issueId: 'monitor:1', sourceGoal: '日常监测' }]
  const draft = (type, label, time) => ({ key: 'monitoring', record: { sourceIds: ['monitor:1'], metricType: type, items: label, measurementPeriod: time } })
  const first = carryAnnualTargets({}, targets, [draft('bloodPressure', '血压', '睡前'), draft('weight', '体重', '晨起')])
  assert.deepEqual(first.modules.monitoring.records.map(row => row.items), ['血压', '体重'])
  assert.equal(carryAnnualTargets(first.modules, targets, [draft('bloodPressure', '血压', '睡前'), draft('weight', '体重', '晨起')]).changed, false)
  const changed = carryAnnualTargets(first.modules, targets, [draft('bloodPressure', '血压', '晨起')]).modules.monitoring.records
  assert.deepEqual(changed.map(row => [row.items, row.measurementPeriod]), [['血压', '晨起']])
})

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

test('已有空日期草稿补入来源建议日期，顾问明确调整或清空后不覆盖', () => {
  const target = [{ issueId: 'visit:1', sourceGoal: '安排就医', sourceTitle: '肺结节' }]
  const draft = [{ key: 'medical_treatment', record: { sourceIds: ['visit:1'], reason: '肺结节', visit_time: '2027-05-05', timingReason: '顾问确认', appointmentSchedulingVersion: 1 } }]
  const old = { medical_treatment: { records: [{ sourceIds: ['visit:1'], reason: '肺结节', screeningDraft: true }] } }
  const filled = carryAnnualTargets(old, target, draft).modules.medical_treatment.records[0]
  assert.equal(filled.visit_time, '2027-05-05')
  assert.equal(filled.timingReason, '顾问确认')
  assert.equal(filled.appointmentSchedulingVersion, 1)
  assert.equal(carryAnnualTargets({ ...old, medical_treatment: { records: [{ ...old.medical_treatment.records[0], visit_time: '2027-05-08' }] } }, target, draft).modules.medical_treatment.records[0].visit_time, '2027-05-08')
  assert.equal(carryAnnualTargets({ ...old, medical_treatment: { records: [{ ...old.medical_treatment.records[0], appointmentSchedulingVersion: 1 }] } }, target, draft).modules.medical_treatment.records[0].visit_time, undefined)
})

test('营养评估与就医同选时仍保留就医草稿', () => {
  const target = [{ issueId: 'management_issue:both', sourceGoal: '安排就医、营养评估', sourceGoals: ['安排就医', '营养评估'], nutritionRelevant: true }]
  const draft = [{ key: 'medical_treatment', record: { sourceIds: ['management_issue:both'], reason: '同一问题', visit_time: '2027-01-19' } }]
  const first = carryAnnualTargets({}, target, draft)
  assert.equal(first.modules.nutrition_assessment.enabled, true)
  assert.equal(first.modules.medical_treatment.records.length, 1)
  assert.equal(carryAnnualTargets(first.modules, target, draft).modules.medical_treatment.records.length, 1)
})

test('多个营养评估问题归总后采用最早建议日期，顾问改期不被覆盖', () => {
  const targets = [
    { issueId: 'issue:1', sourceGoals: ['营养评估'], nutritionRelevant: true,
      directionTimings: { nutrition_assessment: { mode: 'single', firstDueDate: '2027-02-01' } } },
    { issueId: 'issue:2', sourceGoals: ['营养评估'], nutritionRelevant: true,
      directionTimings: { nutrition_assessment: { mode: 'single', firstDueDate: '2027-01-10' } } },
  ]
  const first = carryAnnualTargets({}, targets)
  assert.equal(first.modules.nutrition_assessment.executionDate, '2027-01-10')
  assert.equal(carryAnnualTargets(first.modules, targets).changed, false)
  const advisor = { ...first.modules, nutrition_assessment: { ...first.modules.nutrition_assessment, executionDate: '2027-01-20' } }
  assert.equal(carryAnnualTargets(advisor, targets).modules.nutrition_assessment.executionDate, '2027-01-20')
})

test('AI 已生成同方向行动但日期空白时承接顾问逐方向确认的日期', () => {
  const target = [{ issueId: 'issue:timed', sourceGoals: ['安排就医', '完善检查'] }]
  const drafts = [
    { key: 'medical_treatment', record: { sourceIds: ['issue:timed'], visit_time: '2027-01-19', appointmentSchedulingVersion: 1 } },
    { key: 'checkup_completion', record: { sourceIds: ['issue:timed'], time: '2027-02-20' } },
  ]
  const modules = { medical_treatment: { records: [{ sourceIds: ['issue:timed'], reason: 'AI 草稿' }] },
    checkup_completion: { records: [{ sourceIds: ['issue:timed'], items: 'AI 草稿' }] } }
  const carried = carryAnnualTargets(modules, target, drafts).modules
  assert.equal(carried.medical_treatment.records[0].visit_time, '2027-01-19')
  assert.equal(carried.checkup_completion.records[0].time, '2027-02-20')
  assert.equal(carried.medical_treatment.records.length, 1)
  assert.equal(carried.checkup_completion.records.length, 1)
})

test('既有复查草稿把临床专科从检查科室转到开单科室，保留另行确认的检查科室', () => {
  const target = [{ issueId: 'review:1', sourceGoal: '定期复查' }]
  const draft = [{ key: 'abnormal_followup', record: { reviewGroupVersion: 1, sourceIds: ['review:1'], order_dept: '消化内科' } }]
  const prior = { abnormal_followup: { records: [{ reviewGroupVersion: 1, sourceIds: ['review:1'], department: '消化内科' }] } }
  const moved = carryAnnualTargets(prior, target, draft).modules.abnormal_followup.records[0]
  assert.equal(moved.order_dept, '消化内科')
  assert.equal(moved.department, '')
  assert.equal(carryAnnualTargets(carryAnnualTargets(prior, target, draft).modules, target, draft).changed, false)
  const confirmedExam = { ...prior, abnormal_followup: { records: [{ ...prior.abnormal_followup.records[0], department: '超声科' }] } }
  const retained = carryAnnualTargets(confirmedExam, target, draft).modules.abnormal_followup.records[0]
  assert.equal(retained.order_dept, '消化内科')
  assert.equal(retained.department, '超声科')
})

test('专项筛查再次改期会更新旧草稿，保留顾问独立调整的日期', () => {
  const confirmed = [{ issueId: 'visit:1', sourceGoals: ['安排就医'] }]
  const draft = date => [{ key: 'medical_treatment', record: { visit_time: date, sourceIds: ['visit:1'], appointmentSchedulingVersion: 1 } }]
  const first = carryAnnualTargets({}, confirmed, draft('2026-12-03')).modules
  const next = carryAnnualTargets(first, confirmed, draft('2027-01-05')).modules
  assert.equal(next.medical_treatment.records[0].visit_time, '2027-01-05')
  next.medical_treatment.records[0].visit_time = '2027-01-08'
  assert.equal(carryAnnualTargets(next, confirmed, draft('2027-01-12')).modules.medical_treatment.records[0].visit_time, '2027-01-08')
})
