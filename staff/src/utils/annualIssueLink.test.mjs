import assert from 'node:assert/strict'
import test from 'node:test'
import { targetIssueId, linkedIssueId, actionTargetIds, groupTargetsBySharedActions } from './annualIssueLink.mjs'

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

test('same-day category groups problems while retaining separate actions and sources', () => {
  const targets = [{ issueId: 'lung' }, { issueId: 'stomach' }, { issueId: 'kidney' }, { issueId: 'later' }]
  const actions = [
    { key: 'abnormal_followup', date: '2026-11-20', record: { sourceIds: ['lung'], items: '胸部CT' } },
    { key: 'abnormal_followup', date: '2026-11-20', record: { sourceIds: ['stomach'], items: '胃镜' } },
    { key: 'medical_treatment', date: '2026-11-20', record: { sourceIds: ['kidney'] } },
    { key: 'abnormal_followup', date: '2026-12-20', record: { sourceIds: ['later'] } },
  ]
  const groups = groupTargetsBySharedActions(targets, actions)
  assert.deepEqual(groups.map(group => group.ids), [['lung', 'stomach'], ['kidney'], ['later']])
  assert.deepEqual(actions.map(action => actionTargetIds(action, targets)), [['lung'], ['stomach'], ['kidney'], ['later']])
  assert.equal(actions.length, 4)
})
