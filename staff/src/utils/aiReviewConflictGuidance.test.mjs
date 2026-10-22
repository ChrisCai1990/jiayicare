import test from 'node:test'
import assert from 'node:assert/strict'
import { aiReviewConflictGuidance } from './aiReviewConflictGuidance.mjs'

test('explains why an old high CA72-4 value cannot support a current rising claim', () => {
  const guidance = aiReviewConflictGuidance({ marker: 'CA72-4', reason: 'latest_not_elevated', evidence: [
    { date: '2026-09-23', value: '9.05', referenceRange: '<19.10', classification: 'normal' },
    { date: '2021-07-18', value: '23.470', referenceRange: '0-6.90', classification: 'elevated' },
  ] })
  assert.match(guidance.reason, /2026-09-23.*9\.05.*19\.10.*未高于/)
  assert.match(guidance.suggestion, /既往曾高于.*最近一次未高于/)
})

test('guidance distinguishes uncertain latest evidence from a normal result', () => {
  const guidance = aiReviewConflictGuidance({ marker: 'CA72-4', reason: 'latest_not_elevated', evidence: [
    { date: '2026-09-23', value: '9.05', referenceRange: '', classification: 'unknown' },
  ] })
  assert.match(guidance.reason, /无法确认高于/)
  assert.doesNotMatch(guidance.suggestion, /最近一次未高于/)
})

test('guidance offers distinct changes for repeated and unsupported elevation', () => {
  assert.match(aiReviewConflictGuidance({ marker: 'CA72-4', reason: 'insufficient_repeated_evidence' }).suggestion, /删除“持续\/反复”/)
  assert.match(aiReviewConflictGuidance({ marker: 'CA72-4', reason: 'no_elevated_evidence' }).suggestion, /核对来源报告/)
})
