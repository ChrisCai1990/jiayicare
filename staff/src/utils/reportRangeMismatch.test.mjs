import test from 'node:test'
import assert from 'node:assert/strict'
import { isOutsidePrintedRange, reportRangeMismatches } from './reportRangeMismatch.mjs'

test('flags a reviewed lab value beyond its recorded reference range without changing the row', () => {
  const reviewed = { itemType: 'lab', name: '中性粒细胞绝对值', value: '8.0',
    referenceRange: '1.8-6.3', status: 'normal', manualReviewStatus: 'reviewed' }
  assert.equal(isOutsidePrintedRange(reviewed), true)
  assert.deepEqual(reportRangeMismatches([reviewed]), [reviewed])
  assert.equal(reviewed.status, 'normal')
})

test('handles threshold ranges conservatively', () => {
  assert.equal(isOutsidePrintedRange({ itemType: 'lab', value: '7.71', referenceRange: '0.00–7.00' }), true)
  assert.equal(isOutsidePrintedRange({ itemType: 'lab', value: '5', referenceRange: '<5' }), true)
  assert.equal(isOutsidePrintedRange({ itemType: 'lab', value: '5', referenceRange: '≤5' }), false)
  assert.equal(isOutsidePrintedRange({ itemType: 'lab', value: '5', referenceRange: '见报告' }), false)
})
