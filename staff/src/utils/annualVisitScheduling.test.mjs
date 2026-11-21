import test from 'node:test'
import assert from 'node:assert/strict'
import { autoGroupAnnualVisits, nearDateCandidates, groupVisitRows } from './annualVisitScheduling.mjs'

test('合并就诊选择仅提醒时各事项保持提醒且统一日期', () => {
  const data = { abnormal_followup: { records: [{ items: '肺结节', time: '2026-12-03', serviceMode: 'single', serviceType: 'proxy_booking' },
    { items: '甲状腺超声', time: '2026-12-04', serviceMode: 'reminder' }] } }
  const grouped = groupVisitRows(data, ['abnormal_followup:0', 'abnormal_followup:1'], {
    date: '2026-12-03', leaderKey: 'abnormal_followup:0', serviceMode: 'reminder',
  }).abnormal_followup.records
  assert.deepEqual(grouped.map(row => row.serviceMode), ['reminder', 'reminder'])
  assert.deepEqual(grouped.map(row => row.serviceType), ['', ''])
  assert.equal(grouped[0].visitGroupId, grouped[1].visitGroupId)
  assert.deepEqual(grouped.map(row => row.time), ['2026-12-03', '2026-12-03'])
})

test('同院同日保存后归并，异日只提示，保留手动分开的安排', () => {
  const row = { hospital: '浙二医院', serviceMode: 'reminder', time: '2027-01-04' }
  const input = { abnormal_followup: { records: [row, { ...row, hospital: '浙大二院' }, { ...row, time: '2027-01-10' },
    { ...row, hospital: '另一家医院' }, { ...row, scheduleSeparationReason: '需单独安排' }] } }
  const result = autoGroupAnnualVisits(input)
  const rows = result.abnormal_followup.records
  assert.ok(rows[0].visitGroupId)
  assert.equal(rows[1].visitGroupId, rows[0].visitGroupId)
  assert.equal(rows[2].time, '2027-01-10')
  assert.deepEqual(rows.slice(2).map(r => r.visitGroupId), [undefined, undefined, undefined])
  assert.equal(autoGroupAnnualVisits(result), result)
  assert.deepEqual(nearDateCandidates(result).map(e => e.index).sort(), [0, 1, 2])
})

test('同日同院的多个单项服务分别保留，推送时不能自动变成随同办理', () => {
  const records = [
    { items: '胃镜评估', hospital: '邵逸夫医院', time: '2026-11-28', serviceMode: 'single', serviceType: 'proxy_booking' },
    { items: '进一步检查', hospital: '邵逸夫医院', time: '2026-11-28', serviceMode: 'single', serviceType: 'escort_exam' },
  ]
  const data = { abnormal_followup: { records } }
  assert.equal(autoGroupAnnualVisits(data), data)
  assert.deepEqual(records.map(row => row.serviceMode), ['single', 'single'])
  assert.deepEqual(records.map(row => row.visitGroupId), [undefined, undefined])
})

test('已保存的同次分组若全部改为单项服务，保存时解除冲突分组', () => {
  const records = [
    { items: '胃镜评估', hospital: '邵逸夫医院', time: '2026-11-28', serviceMode: 'single', serviceType: 'proxy_booking', visitGroupId: '2026-11-28 邵逸夫医院同次就诊' },
    { items: '进一步检查', hospital: '邵逸夫医院', time: '2026-11-28', serviceMode: 'single', serviceType: 'escort_exam', visitGroupId: '2026-11-28 邵逸夫医院同次就诊' },
  ]
  const data = { abnormal_followup: { records } }
  const result = autoGroupAnnualVisits(data)
  assert.deepEqual(result.abnormal_followup.records.map(row => row.visitGroupId), ['', ''])
  assert.deepEqual(result.abnormal_followup.records.map(row => row.serviceType), ['proxy_booking', 'escort_exam'])
  assert.equal(autoGroupAnnualVisits(result), result)
})
