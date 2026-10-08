import test from 'node:test'
import assert from 'node:assert/strict'
import { displayIssueId, targetIssueId, groupTargetsBySharedActions } from '../src/utils/annualIssueLink.mjs'

test('integrated plan keeps explicit links and conservatively groups unlinked legacy actions', () => {
  const targets = [{goal:'明确血压目标',sourceReviewId:'r',sourceIndex:0},{goal:'完成颈动脉检查',sourceReviewId:'r',sourceIndex:1}]
  const raw = [{reason:'完成ABPM检查',hospital:'医院甲',visit_time:'2026-11-05'}, {items:'颈动脉超声'}, {items:'年度体检'}, {issueId:'removed',items:'颈动脉超声'}]
  const before=JSON.stringify(raw)
  const groups=raw.map(row=>displayIssueId(row,targets))
  assert.deepEqual(groups,[targetIssueId(targets[0],0),targetIssueId(targets[1],1),'',''])
  assert.equal(JSON.stringify(raw),before)
  assert.equal(displayIssueId({items:'颈动脉超声',issueId:targetIssueId(targets[0],0)},targets),targetIssueId(targets[0],0))
})

test('ambiguous gut actions remain visible in shared arrangements without merging or deletion', () => {
  const targets=[{goal:'直肠息肉随访'},{goal:'盲肠腺瘤随访'}]
  assert.equal(displayIssueId({reason:'直肠息肉及盲肠腺瘤评估'},targets),'')
  assert.equal(displayIssueId({items:'复查'},targets),'')
})

test('one consultation groups two source goals without deleting their evidence', () => {
  const targets = [{ issueId: 'rectal', goal: '核实直肠息肉' }, { issueId: 'cecal', goal: '核实盲肠腺瘤' }, { issueId: 'other', goal: '其他目标' }]
  const actions = [{ record: { issueId: 'rectal', issueIds: ['rectal', 'cecal'], reason: '同次消化内科复核' } }]
  const groups = groupTargetsBySharedActions(targets, actions)
  assert.deepEqual(groups.map(group => group.ids), [['rectal', 'cecal'], ['other']])
  assert.equal(groups[0].entries.length, 2)
  assert.equal(targets.length, 3)
})
