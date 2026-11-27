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

test('reviewed page shows the actual section conflict and retains unrelated warnings', () => {
  const reviewed = (name, sourceSection) => ({ sourcePage: 7, name, sourceSection, itemType: 'imaging', manualReviewStatus: 'reviewed', findings: '原件所见' })
  const items = [reviewed('甲状腺超声检查', '心脏彩超'), reviewed('双侧乳房彩超检查', '双侧乳房彩超检查')]
  const evidence = { 7: { status: 'needs_review', blockedReasons: { uncovered_sections: 4, uncovered_rows: 2 }, uncoveredSections: ['甲状腺超声检查', '【双侧乳房彩超检查】', '诊断结论', '心脏彩色多普勒超声检查'] } }
  assert.deepEqual(summarizeReportPages([7], items, evidence)[0].reasons,
    ['已核对项目栏目不符 1', '原件结果行待补 2', '检查栏目待核对 1'])
  assert.equal(evidence[7].uncoveredSections.length, 4)
})
