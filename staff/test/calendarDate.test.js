import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDate } from '../src/utils/calendarDate.js'

test('continuous input and pasted dates produce the same calendar date', () => {
  for (const value of ['20261001', '2026-10-01', '2026/10/1', '2026年10月1日']) {
    assert.equal(calendarDate(value), '2026-10-01')
  }
})
test('reject incomplete dates, overflowing years and impossible days', () => {
  for (const value of ['', '202610', '202610-01-01', '2026-02-29', '2026-04-31', '2026-13-01', '0000-01-01']) {
    assert.equal(calendarDate(value), '')
  }
  assert.equal(calendarDate('20240229'), '2024-02-29')
})
