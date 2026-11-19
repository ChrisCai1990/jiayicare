import test from 'node:test'
import assert from 'node:assert/strict'
import { groupVisitRows } from './annualVisitScheduling.mjs'

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
