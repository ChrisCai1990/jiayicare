import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { nearbyVisitRows, changeVisitDate, changeVisitSeparationReason, groupVisitRows } from '../src/utils/annualVisitScheduling.mjs'
const require = createRequire(import.meta.url)
const { validate } = require('../../backend/src/utils/annualPlanPublishValidation.js')

const sample = () => ({
  medical_treatment: { records: [
    { reason: '胃肠就诊', visit_time: '2026-11-10', hospital: '浙二医院', serviceMode: 'managed', managedServiceType: 'outpatient' },
    { reason: '心血管就诊', visit_time: '2026-12-04', hospital: '浙二医院', serviceMode: 'managed', managedServiceType: 'outpatient' },
  ] },
  abnormal_followup: { records: [{ items: '检查复查', time: '2026-12-05', hospital: '浙江大学医学院附属第二医院', serviceMode: 'managed' }] },
})

test('相近日期靠在一起，但不自动改日期或服务方式', () => {
  const data = sample()
  const rows = nearbyVisitRows(data)
  assert.deepEqual(rows.map(row => row.date), ['2026-11-10', '2026-12-04', '2026-12-05'])
  assert.notEqual(rows[0].cluster, rows[1].cluster)
  assert.equal(rows[1].cluster, rows[2].cluster)
  assert.equal(data.abnormal_followup.records[0].serviceMode, 'managed')
})

test('顾问改组内任意事项日期时，整次就诊同步', () => {
  const data = groupVisitRows(sample(), ['medical_treatment:1', 'abnormal_followup:0'], { date: '2026-12-04', leaderKey: 'medical_treatment:1', serviceMode: 'managed' })
  const next = changeVisitDate(data, 'abnormal_followup', 0, '2026-12-06')
  assert.equal(next.medical_treatment.records[1].visit_time, '2026-12-06')
  assert.equal(next.abnormal_followup.records[0].time, '2026-12-06')
  assert.equal(data.medical_treatment.records[1].visit_time, '2026-12-04')
})

test('调整 AI 建议日期后可一次归类，保留单个服务并承载全部事项', () => {
  const data = groupVisitRows(sample(), ['medical_treatment:0', 'medical_treatment:1', 'abnormal_followup:0'], { date: '2026-12-04', leaderKey: 'medical_treatment:1', serviceMode: 'managed' })
  const rows = [...data.medical_treatment.records, ...data.abnormal_followup.records]
  assert.ok(rows.every(row => (row.visit_time || row.time) === '2026-12-04'))
  assert.equal(new Set(rows.map(row => row.visitGroupId)).size, 1)
  assert.equal(rows.filter(row => row.serviceMode === 'managed').length, 1)
  assert.equal(rows.filter(row => row.serviceMode === 'shared').length, 2)
  assert.equal(validate(data, '2026-10-08'), '')
})

test('不同医院或已有组只选部分时拒绝误归类', () => {
  const different = sample()
  different.abnormal_followup.records[0].hospital = '另一家医院'
  assert.throws(() => groupVisitRows(different, ['medical_treatment:1', 'abnormal_followup:0'], { date: '2026-12-04', leaderKey: 'medical_treatment:1', serviceMode: 'managed' }), /同一医院/)
  const grouped = groupVisitRows(sample(), ['medical_treatment:1', 'abnormal_followup:0'], { date: '2026-12-04', leaderKey: 'medical_treatment:1', serviceMode: 'managed' })
  assert.throws(() => groupVisitRows(grouped, ['medical_treatment:0', 'medical_treatment:1'], { date: '2026-12-04', leaderKey: 'medical_treatment:1', serviceMode: 'managed' }), /整组选择/)
})

test('已有分开依据须先核实，清除后才允许归类', () => {
  const data = sample()
  data.abnormal_followup.records[0].scheduleSeparationReason = '检查准备要求待核实'
  const options = { date: '2026-12-04', leaderKey: 'medical_treatment:1', serviceMode: 'managed' }
  const keys = ['medical_treatment:1', 'abnormal_followup:0']
  assert.throws(() => groupVisitRows(data, keys, options), /分开安排/)
  const reviewed = changeVisitSeparationReason(data, 'abnormal_followup', 0, '')
  assert.equal(validate(groupVisitRows(reviewed, keys, options), '2026-10-08'), '')
})
