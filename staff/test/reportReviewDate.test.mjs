import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveReportReviewDate } from '../../shared/reportReviewDate.mjs'

test('reviewer confirmed report date survives conflicting OCR dates', () => {
  assert.equal(resolveReportReviewDate('2026-09-23', ['2026-09-23', '2026-09-22'], ['2026-09-21']), '2026-09-23')
})

test('without a confirmed report date, infer only a single complete date', () => {
  assert.equal(resolveReportReviewDate('', ['2026-09-23', '2026-09-23']), '2026-09-23')
  assert.equal(resolveReportReviewDate('', ['2026-09-23', '2026-09-22']), '')
  assert.equal(resolveReportReviewDate('', ['2026-09-23', '']), '')
})

test('invalid entered date fails before submission', () => {
  assert.throws(() => resolveReportReviewDate('2026-09-', ['2026-09-23']), /完整有效/)
})
