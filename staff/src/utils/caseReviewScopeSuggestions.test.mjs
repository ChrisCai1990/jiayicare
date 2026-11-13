import test from 'node:test'
import assert from 'node:assert/strict'
import { suggestCaseReviewScopes } from './caseReviewScopeSuggestions.mjs'

test('专病主题建议相关基础资料而非全部八类', () => {
  assert.deepEqual(suggestCaseReviewScopes('specialty', '甲胎蛋白升高'), ['basic', 'healthProfile', 'reports'])
})

test('主题文字只增补明确相关类别，人工仍可调整最终勾选', () => {
  assert.deepEqual(suggestCaseReviewScopes('specialty', '血压监测与用药随访'),
    ['basic', 'healthProfile', 'reports', 'healthRecords', 'medications', 'followups'])
})
