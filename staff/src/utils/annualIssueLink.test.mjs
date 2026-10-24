import assert from 'node:assert/strict'
import test from 'node:test'
import { targetIssueId, linkedIssueId, groupTargetsBySharedActions } from './annualIssueLink.mjs'

test('only a unique reviewed issue is linked automatically', () => {
  const targets = [{ sourceReviewId: 'abc', sourceIndex: 0, goal: '目标' }]
  assert.equal(linkedIssueId({ sourceIds: ['review:abc:action:1'] }, targets), targetIssueId(targets[0], 0))
  assert.equal(linkedIssueId({ sourceIds: ['review:abc', 'review:def'] }, targets), '')
  assert.equal(linkedIssueId({ sourceIds: 'review:abc' }, targets), '')
  assert.equal(linkedIssueId({ issueId: 'unknown', sourceIds: ['review:abc'] }, targets), '')
  assert.equal(linkedIssueId({ issueId: targetIssueId(targets[0], 0) }, targets), targetIssueId(targets[0], 0))
})

test('confirmed management source IDs attach actions to their problem and share one combined action', () => {
  const targets = [{ issueId: 'management_issue:a' }, { issueId: 'management_issue:b' }]
  assert.equal(linkedIssueId({ sourceIds: ['management_issue:a'] }, targets), 'management_issue:a')
  assert.equal(linkedIssueId({ issueId: 'management_issue:b', sourceIds: ['management_issue:a'] }, targets), 'management_issue:a')
  const groups = groupTargetsBySharedActions(targets, [{ record: { sourceIds: ['management_issue:a', 'management_issue:b'] } }])
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].ids, ['management_issue:a', 'management_issue:b'])
})

test('multiple targets in one review stay unassigned', () => {
  const targets = [{ sourceReviewId: 'abc', sourceIndex: 0 }, { sourceReviewId: 'abc', sourceIndex: 1 }]
  assert.equal(linkedIssueId({ sourceIds: ['review:abc:action:1'] }, targets), '')
})
