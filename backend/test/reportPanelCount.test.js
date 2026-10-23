const test = require('node:test');
const assert = require('node:assert/strict');
const { findUnderExtractedPages } = require('../src/utils/reportPanelCount');
const { mergeCoverageAuditItems } = require('../src/utils/reportAuditMerge');
const { filterMissingReportItems } = require('../src/utils/reportPageSupplement');
const { tagReportPageItems } = require('../src/utils/reportSourceOrder');

const panel = (title, page, names, field = 'sourceSection') => names.map(name => ({
  name, itemType: 'lab', value: '1', [field]: title, sourcePage: page, _page: page,
}));

test('missing rows are detected when the printed item count is in sourceSection', () => {
  const items = [
    ...panel('（空腹）血脂五项', 14, ['总胆固醇', '甘油三酯', '高密度脂蛋白', '低密度脂蛋白']),
    ...panel('肿瘤十二项（女）', 15, Array.from({ length: 9 }, (_, i) => `肿瘤项${i}`)),
    ...panel('乙肝三系定量（六项）', 16, ['核心抗体IgM', 'e抗原', 'e抗体', '表面抗原']),
  ];
  const result = findUnderExtractedPages(items);
  assert.deepEqual(result.pagesToRetry, [14, 15, 16]);
  assert.deepEqual(result.underOrders.map(({ expected, actual }) => [expected, actual]), [[5, 4], [12, 9], [6, 4]]);
});

test('complete panels and untitled sections do not trigger another model call', () => {
  const items = [
    ...panel('血脂五项', 14, ['A', 'B', 'C', 'D', 'E']),
    ...panel('常规化验', 15, ['F', 'G']),
    ...panel('乙肝六项', 16, ['H', 'I', 'J', 'K', 'L', 'M'], 'orderName'),
  ];
  assert.deepEqual(findUnderExtractedPages(items), { pagesToRetry: [], underOrders: [] });
});

test('count retry adds a measured missing row without replacing an existing result', () => {
  const original = tagReportPageItems([
    { name: '总胆固醇', itemType: 'lab', value: '4.58', sourceSection: '血脂五项' },
  ], 14);
  const retry = tagReportPageItems([
    { name: '总胆固醇', itemType: 'lab', value: '4.80', sourceSection: '血脂五项' },
    { name: '脂蛋白a', itemType: 'lab', value: '318.4', status: 'abnormal', sourceSection: '血脂五项' },
  ], 14);
  const merged = mergeCoverageAuditItems(original, filterMissingReportItems(original, retry.filter(item => item.value)));
  assert.equal(merged.length, 2);
  assert.equal(merged.find(item => item.name === '总胆固醇').value, '4.58');
  assert.equal(merged.find(item => item.name === '脂蛋白a').value, '318.4');
});
