import assert from 'node:assert/strict'
import test from 'node:test'
import { insertReportItemBelow, orderReportItemsForReview, sameReviewSection } from '../src/utils/reportItemOrder.js'

test('补提栏目序号冲突时仍将血常规和尿常规分组展示', () => {
  const items = [
    { name: '白细胞计数', sourceSection: '【检查科LAB检查】', sourceSectionOrder: 1, sourceRowOrder: 1 },
    { name: '葡萄糖', sourceSection: '尿液干化学分析', sourceSectionOrder: 1, sourceRowOrder: 7 },
    { name: '血红蛋白量', sourceSection: '【检查科LAB检查】', sourceSectionOrder: 1, sourceRowOrder: 2 },
    { name: '尿液颜色', sourceSection: '『尿液干化学分析』', sourceSectionOrder: 2, sourceRowOrder: 1 },
  ]
  const ordered = orderReportItemsForReview(items.map((it, i) => ({ it, i })))
  assert.deepEqual(ordered.map(({ it }) => it.name), ['白细胞计数', '血红蛋白量', '尿液颜色', '葡萄糖'])
  assert.equal(sameReviewSection(items[1], items[3]), true)
})

test('修复顺序元数据后依照栏目号恢复跨分区的原件栏目次序', () => {
  const items = [
    { name: '甲状腺素', sourceSection: 'T3,T4,TSH', sourceSectionOrder: 2, sourceRowOrder: 2 },
    { name: '胱抑素', sourceSection: '胰岛素/胱抑素', sourceSectionOrder: 4, sourceRowOrder: 1 },
    { name: '25-羟基维生素D', sourceSection: '25-羟基维生素D', sourceSectionOrder: 3, sourceRowOrder: 1 },
  ]
  assert.deepEqual(orderReportItemsForReview(items.map((it, i) => ({ it, i }))).map(({ it }) => it.name),
    ['甲状腺素', '25-羟基维生素D', '胱抑素'])
})

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
