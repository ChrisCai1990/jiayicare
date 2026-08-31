const test = require('node:test');
const assert = require('node:assert/strict');
const { describeExistingReportItems, filterMissingReportItems } = require('../src/utils/reportPageSupplement');

test('单页补提会向模型列出已有项目及所属栏目', () => {
  assert.equal(describeExistingReportItems([
    { name: '白细胞计数', orderName: '血常规' },
    { name: '胆囊超声', sourceSection: '腹部超声' },
  ]), '白细胞计数（血常规）、胆囊超声（腹部超声）');
});

test('单页补提硬过滤已有项目，即使AI返回了不同数值', () => {
  const existing = [{ name: '白细胞计数', itemType: 'lab', value: '5.1', unit: '10^9/L', orderName: '血常规' }];
  const candidates = [
    { name: '白细胞计数', itemType: 'lab', value: '5.7', unit: '10^9/L', orderName: '血常规' },
    { name: '血小板计数', itemType: 'lab', value: '210', unit: '10^9/L', orderName: '血常规' },
  ];
  assert.deepEqual(filterMissingReportItems(existing, candidates).map(item => item.name), ['血小板计数']);
});

test('不同栏目下的同名项目仍可作为真实缺项补提', () => {
  const existing = [{ name: '结论', itemType: 'imaging', sourceSection: '心电图' }];
  const candidates = [{ name: '结论', itemType: 'imaging', sourceSection: '胸部CT' }];
  assert.equal(filterMissingReportItems(existing, candidates).length, 1);
});
