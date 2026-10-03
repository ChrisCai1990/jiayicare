import assert from 'node:assert/strict'
import test from 'node:test'
import { targetIssueId, linkedIssueId } from './annualIssueLink.mjs'

test('only a unique reviewed issue is linked automatically', () => {
  const targets = [{ sourceReviewId: 'abc', sourceIndex: 0, goal: '目标' }]
  assert.equal(linkedIssueId({ sourceIds: ['review:abc:action:1'] }, targets), targetIssueId(targets[0], 0))
  assert.equal(linkedIssueId({ sourceIds: ['review:abc', 'review:def'] }, targets), '')
  assert.equal(linkedIssueId({ sourceIds: 'review:abc' }, targets), '')
  assert.equal(linkedIssueId({ issueId: 'unknown', sourceIds: ['review:abc'] }, targets), '')
  assert.equal(linkedIssueId({ issueId: targetIssueId(targets[0], 0) }, targets), targetIssueId(targets[0], 0))
})

test('multiple targets in one review stay unassigned', () => {
  const targets = [{ sourceReviewId: 'abc', sourceIndex: 0 }, { sourceReviewId: 'abc', sourceIndex: 1 }]
  assert.equal(linkedIssueId({ sourceIds: ['review:abc:action:1'] }, targets), '')
})
