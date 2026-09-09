import assert from 'node:assert/strict'
import test from 'node:test'
import { insertReportItemBelow } from '../src/utils/reportItemOrder.js'

test('下方新增继承原件位置并插入当前项目之后', () => {
  const items = [
    { name: '尿a1微球蛋白', sourcePage: 1, sourceSection: '肾功能', sourceSectionOrder: 1, sourceRowOrder: 1, orderName: '肾功能' },
    { name: '尿蛋白', sourcePage: 1, sourceSection: '肾功能', sourceSectionOrder: 1, sourceRowOrder: 2, orderName: '肾功能' },
    { name: '肝功能', sourcePage: 1, sourceSection: '肝功能', sourceSectionOrder: 2, sourceRowOrder: 1 },
  ]

  const result = insertReportItemBelow(items, 0, { name: '', itemType: 'lab' })

  assert.equal(result[1].sourcePage, 1)
  assert.equal(result[1].sourceSection, '肾功能')
  assert.equal(result[1].sourceSectionOrder, 1)
  assert.equal(result[1].sourceRowOrder, 2)
  assert.equal(result[2].sourceRowOrder, 3)
  assert.equal(result[3].sourceRowOrder, 1)
})
