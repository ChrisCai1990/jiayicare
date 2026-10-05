import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveScreeningCategory, screeningCategoryLabel } from './screeningCategoryLabel.mjs'

const tree = [
  { _id: 'functional', children: [
    { label: '端粒长度检测', aliases: ['端粒长度'] },
    { label: '精准基因检测（阖家欢）', aliases: [] },
  ], catalogLabels: [
    { label: '基因检测', aliases: [] },
    { label: '健康生活', aliases: [] },
    { label: '端粒长度检测', aliases: ['端粒长度'] },
    { label: '精准基因检测（阖家欢）', aliases: [] },
  ] },
  { _id: 'other', children: [{ label: '另一项目', aliases: ['端粒长度'] }] },
]

test('historical alias uses admin category name within its top-level category', () => {
  assert.equal(screeningCategoryLabel(tree, 'functional', '端粒长度'), '端粒长度检测')
  assert.equal(screeningCategoryLabel(tree, 'functional', '精准基因检测（阖家欢）'), '精准基因检测（阖家欢）')
  assert.equal(screeningCategoryLabel(tree, 'functional', '精准基因检测'), '精准基因检测')
})

test('unknown and ambiguous names remain separate', () => {
  const ambiguousTree = structuredClone(tree)
  ambiguousTree[0].catalogLabels.push({ label: '其他端粒项目', aliases: ['端粒长度'] })
  assert.equal(screeningCategoryLabel(ambiguousTree, 'functional', '端粒长度'), '端粒长度')
  assert.equal(screeningCategoryLabel(tree, 'missing', '端粒长度'), '端粒长度')
})

test('a historical report without a category joins only a unique admin match', () => {
  assert.deepEqual(resolveScreeningCategory(tree, '', '精准基因检测（阖家欢）'), {
    l1Id: 'functional', label: '精准基因检测（阖家欢）',
  })
  assert.deepEqual(resolveScreeningCategory(tree, '', '端粒长度'), { l1Id: '', label: '端粒长度' })
  assert.deepEqual(resolveScreeningCategory(tree, '', '动态心电图+动态血压'), { l1Id: '', label: '动态心电图+动态血压' })
})
