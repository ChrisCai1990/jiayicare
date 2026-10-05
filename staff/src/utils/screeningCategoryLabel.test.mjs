import test from 'node:test'
import assert from 'node:assert/strict'
import { screeningCategoryLabel } from './screeningCategoryLabel.mjs'

const tree = [
  { _id: 'functional', children: [
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
  tree[0].children.push({ label: '其他端粒项目', aliases: ['端粒长度'] })
  assert.equal(screeningCategoryLabel(tree, 'functional', '端粒长度'), '端粒长度')
  assert.equal(screeningCategoryLabel(tree, 'missing', '端粒长度'), '端粒长度')
})
