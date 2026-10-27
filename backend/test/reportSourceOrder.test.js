const test = require('node:test');
const assert = require('node:assert/strict');
const { tagReportPageItems, sortReportItemsBySource, stripReportSourceOrder, resequenceSupplementSourceOrder } = require('../src/utils/reportSourceOrder');

test('上下分区补提合并后重新编号，血常规和尿常规不交错', () => {
  const raw = [
    { name: '白细胞计数', sourceSection: '【检查科LAB检查】', sourceSectionOrder: 1, sourceRowOrder: 1 },
    { name: '血红蛋白量', sourceSection: '【检查科LAB检查】', sourceSectionOrder: 1, sourceRowOrder: 2 },
    { name: '尿液颜色', sourceSection: '『尿液干化学分析』', sourceSectionOrder: 2, sourceRowOrder: 1 },
    { name: '葡萄糖', sourceSection: '尿液干化学分析', sourceSectionOrder: 1, sourceRowOrder: 7 },
    { name: '酮体', sourceSection: '尿液干化学分析', sourceSectionOrder: 1, sourceRowOrder: 8 },
  ];
  const ordered = sortReportItemsBySource(resequenceSupplementSourceOrder(raw));
  assert.deepEqual(ordered.map(item => item.name), raw.map(item => item.name));
  assert.deepEqual(ordered.map(item => [item.sourceSectionOrder, item.sourceRowOrder]), [[1, 1], [1, 2], [2, 1], [2, 2], [2, 3]]);
});

test('按原件栏目及栏目内行序排列，不采信模型交错返回的数组位置', () => {
  const raw = [
    { name: '身高', sourceSection: '一般检查室', sourceSectionOrder: 1, sourceRowOrder: 1 },
    { name: '心率', sourceSection: '内科', sourceSectionOrder: 2, sourceRowOrder: 3 },
    { name: '体重', sourceSection: '一般检查室', sourceSectionOrder: 1, sourceRowOrder: 2 },
    { name: '体重指数', sourceSection: '一般检查室', sourceSectionOrder: 1, sourceRowOrder: 3 },
    { name: '收缩压', sourceSection: '一般检查室', sourceSectionOrder: 1, sourceRowOrder: 4 },
    { name: '舒张压', sourceSection: '一般检查室', sourceSectionOrder: 1, sourceRowOrder: 5 },
    { name: '病史', sourceSection: '内科', sourceSectionOrder: 2, sourceRowOrder: 1 },
    { name: '家族史', sourceSection: '内科', sourceSectionOrder: 2, sourceRowOrder: 2 },
  ];
  const ordered = sortReportItemsBySource(tagReportPageItems(raw, 6));
  assert.deepEqual(ordered.map(item => item.name), ['身高', '体重', '体重指数', '收缩压', '舒张压', '病史', '家族史', '心率']);
  assert.deepEqual(stripReportSourceOrder(ordered).map(item => item.sourceRowOrder), [1, 2, 3, 4, 5, 1, 2, 3]);
});

test('旧模型未返回视觉行号时，至少固定栏目顺序而不把后栏项目插入前栏', () => {
  const raw = [
    { name: '身高', sourceSection: '一般检查室' },
    { name: '心率', sourceSection: '内科' },
    { name: '体重', sourceSection: '一般检查室' },
  ];
  const ordered = sortReportItemsBySource(tagReportPageItems(raw, 6));
  assert.deepEqual(ordered.map(item => item.name), ['身高', '体重', '心率']);
  assert.deepEqual(ordered.map(item => [item.sourceSectionOrder, item.sourceRowOrder]), [[1, 1], [1, 2], [2, 1]]);
});
