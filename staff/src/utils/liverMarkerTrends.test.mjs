import test from 'node:test'
import assert from 'node:assert/strict'
import { liverMarkerTrends, liverKeyChanges } from './liverMarkerTrends.mjs'
const card = rows => ({ name: '肝癌', sourceEvidence: [{ items: rows }] })
const point = (date, value, unit = 'IU/mL', name = '乙型肝炎病毒表面抗原定量') => ({ date, value, unit, name, referenceRange: '<0.05' })
test('aliases group, deduplicate and sort dates without changing values', () => {
  const rows = [point('2026-09-23', '3'), point('2024-07-11', '5', 'IU/mL', 'HBsAg'), point('2026-09-23', '3')]
  const [group] = liverMarkerTrends(card(rows))
  assert.equal(group.points.length, 2)
  assert.equal(group.first.value, '5')
  assert.equal(group.trend, '首末数值下降')
})
test('thresholds, incompatible units and same-day conflicts cannot imply numeric trend', () => {
  assert.match(liverMarkerTrends(card([point('2024', '>250'), point('2026', '>250')]))[0].trend, /结果一致/)
  assert.match(liverMarkerTrends(card([point('2024', '<20'), point('2026', '10')]))[0].trend, /不能计算/)
  assert.match(liverMarkerTrends(card([point('2024', '2', 'IU/L'), point('2026', '3')]))[0].trend, /单位或参考范围不同/)
  assert.match(liverMarkerTrends(card([point('2026', '2'), point('2026', '3')]))[0].trend, /同日结果待核对/)
})

test('same-date results from two pages of one report are not described as two reports', () => {
  const rows = [
    { ...point('2025-09-23', '2.71', 'IU/ml', '乙肝表面抗体'), sourcePage: 1 },
    { ...point('2025-09-23', '<2.000', 'IU/ml', '乙肝表面抗体'), sourcePage: 15 },
  ]
  const [group] = liverMarkerTrends({ name: '肝癌', sourceEvidence: [{ reportId: 'same-report', items: rows }] })
  assert.equal(group.datedResults[0].needsDateReview, true)
  assert.match(group.datedResults[0].reviewMessage, /同一份报告第 1、15 页有不同结果/)
  assert.doesNotMatch(group.datedResults[0].reviewMessage, /不同报告/)
})

test('same-date results from separate reports identify the separate sources', () => {
  const [group] = liverMarkerTrends({ name: '肝癌', sourceEvidence: [
    { reportId: 'report-a', items: [point('2025-09-23', '2.71')] },
    { reportId: 'report-b', items: [point('2025-09-23', '<2.000')] },
  ] })
  assert.match(group.datedResults[0].reviewMessage, /不同报告/)
})
test('all years stay visible and only matching full dates need review', () => {
  const rows = [point('2022-06-23', '>250.00'), point('2023-08-23', '> 250.00 ↑'), point('2023-08-23', '> 250.00'), point('2024-07-11', '>250.00'), point('2025-09-23', '>250.00'), point('2026-09-23', '>250.00')]
  const [group] = liverMarkerTrends(card(rows))
  assert.equal(group.datedResults.length, 5)
  assert.deepEqual(group.conflictDates, [])
  assert.equal(group.datedResults[1].results.length, 1)
  assert.equal(group.trend, '历次报告结果一致')
  const [conflict] = liverMarkerTrends(card([...rows, point('2025-09-23', '414.00')]))
  assert.deepEqual(conflict.conflictDates, ['2025-09-23'])
})
test('raw prose is hidden only when source-based trends are available', () => {
  const changes = ['MRI确认血管瘤', '肝炎筛查原报告：大量数值']
  assert.deepEqual(liverKeyChanges({ ...card([point('2026', '3')]), keyChanges: changes }), [changes[0]])
  assert.deepEqual(liverKeyChanges({ name: '肝癌', keyChanges: changes }), changes)
})
