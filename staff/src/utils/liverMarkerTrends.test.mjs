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
  assert.match(liverMarkerTrends(card([point('2026', '2'), point('2026', '3')]))[0].trend, /同日结果不一致/)
})
test('raw prose is hidden only when source-based trends are available', () => {
  const changes = ['MRI确认血管瘤', '肝炎筛查原报告：大量数值']
  assert.deepEqual(liverKeyChanges({ ...card([point('2026', '3')]), keyChanges: changes }), [changes[0]])
  assert.deepEqual(liverKeyChanges({ name: '肝癌', keyChanges: changes }), changes)
})
