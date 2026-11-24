import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeReportPages } from './reportPageCoverage.mjs'

test('page review summary exposes independent gaps without calling blank pages complete', () => {
  const rows = summarizeReportPages([1, 2, 3, 4], [
    { sourcePage: 1, name: '血糖' }, { sourcePage: 2, name: '肝脏超声' },
  ], {
    2: { status: 'needs_review', blockedReasons: { uncovered_sections: 1 } },
    3: { status: 'image_only' },
  }, { pagesWithGaps: [1] }, { 4: { status: 'failed' } })
  assert.deepEqual(rows.map(row => row.reasons), [
    ['文字层结果行待核对'], ['检查栏目待核对 1'], [],
    ['本页补提失败', '无提取数据，请查看原件'],
  ])
  assert.equal(rows[2].label, '影像资料页')
  assert.equal(rows[3].needsAttention, true)
})

test('unverified source and supplement are visible even when items exist', () => {
  const [row] = summarizeReportPages([1], [{ name: '项目' }],
    { 1: { status: 'needs_review', blockedReasons: { row_mismatch: 1 } } }, {},
    { 1: { status: 'needs_review' } })
  assert.deepEqual(row.reasons, ['原文待核对'])
})

test('failed first-pass pages remain visible even if a candidate survived', () => {
  const [row] = summarizeReportPages([7], [{ sourcePage: 7, name: '检查' }], {}, {}, {}, [7])
  assert.deepEqual(row.reasons, ['首轮识别失败或不完整'])
})
