import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { lifestyleHistoryLabels, lifestyleHistoryLabel } from '../src/utils/lifestyleHistoryLabels.mjs'

const require = createRequire(import.meta.url)
const { ARCHIVE_FIELDS } = require('../../backend/src/config/archiveFields.js')

test('生活方式历史字段均有中文显示名', () => {
  const keys = ARCHIVE_FIELDS
    .filter(field => field.path.startsWith('lifestyle_data.'))
    .map(field => field.path.slice('lifestyle_data.'.length))
  assert.deepEqual(keys.filter(key => !lifestyleHistoryLabels[key]), [])
  for (const key of [...keys, 'autoSummaryFlags', 'summaryOverride']) {
    assert.match(lifestyleHistoryLabel(key), /[\u4e00-\u9fff]/)
    assert.notEqual(lifestyleHistoryLabel(key), key)
  }
})

test('新字段不会直接显示英文内部键', () => {
  assert.equal(lifestyleHistoryLabel('futureInternalKey'), '其他生活方式信息')
  assert.equal(lifestyleHistoryLabel('营养评估 · 情绪状态'), '营养评估 · 情绪状态')
})
