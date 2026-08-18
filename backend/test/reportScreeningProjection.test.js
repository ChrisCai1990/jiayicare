const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReportScreeningCandidates, mergeScreeningProjectionKeys } = require('../src/utils/reportScreeningProjection');
const { ensureReportItemSourceIds } = require('../src/utils/reportItemSource');
const { resolveActiveScreeningKey } = require('../src/utils/screeningCatalogKey');

test('人工候选归类只接受当前启用目录中的完整层级键', () => {
  const categories = [
    { _id: 'root', name: '慢病筛查', parent: null },
    { _id: 'parent', name: '糖代谢', parent: 'root' },
    { _id: 'leaf', name: '空腹血糖', parent: 'parent' },
  ];
  assert.deepEqual(resolveActiveScreeningKey(categories, 'root|糖代谢|空腹血糖'), {
    value: 'root|糖代谢|空腹血糖', l1Id: 'root', parentLabel: '糖代谢', itemLabel: '空腹血糖',
  });
  assert.equal(resolveActiveScreeningKey(categories, 'root|错误父级|空腹血糖'), null);
  assert.equal(resolveActiveScreeningKey(categories, 'missing|糖代谢|空腹血糖'), null);
});

test('功能医学目录不能通过候选归类进入自动筛查投影', () => {
  const categories = [
    { _id: 'functional', name: '功能医学', parent: null },
    { _id: 'leaf', name: '有机酸', parent: 'functional' },
  ];
  assert.equal(resolveActiveScreeningKey(categories, 'functional|功能医学|有机酸'), null);
});

test('历史项目稳定补齐来源标识且保留已有标识', () => {
  const input = [
    { name: '血糖', sourcePage: 3, sourceSection: '生化', itemType: 'lab' },
    { name: '血脂', sourcePage: 3, sourceSection: '生化', itemType: 'lab' },
    { name: 'CT', sourceItemId: 'existing' },
  ];
  const first = ensureReportItemSourceIds(input);
  const second = ensureReportItemSourceIds(input);
  assert.equal(first[0].sourceItemId, second[0].sourceItemId);
  assert.notEqual(first[0].sourceItemId, first[1].sourceItemId);
  assert.equal(first[2].sourceItemId, 'existing');
});

test('正式报告中的未归类项目进入独立候选，已归类项目不重复进入', () => {
  const result = buildReportScreeningCandidates([
    { sourceItemId: 'a', name: '血糖', itemType: 'lab', sourcePage: 3, status: 'normal', matchStatus: 'unclassified' },
    { sourceItemId: 'b', name: '肺部CT', screeningKey: 'l1|l2|肺部CT', matchStatus: 'matched' },
    { sourceItemId: 'c', name: '肝功能', screeningKeys: ['l1|l2|肝功能'], matchStatus: 'matched' },
  ]);
  assert.deepEqual(result, [{
    sourceItemId: 'a',
    itemSnapshot: { name: '血糖', itemType: 'lab', sourcePage: 3, sourceSection: '', orderName: '', status: 'normal' },
  }]);
});

test('缺少稳定来源标识或名称的空壳项目不创建候选', () => {
  assert.deepEqual(buildReportScreeningCandidates([
    { name: '无来源标识' },
    { sourceItemId: 'blank', name: '  ' },
    null,
  ]), []);
});

test('审核重试保留当前版本中已经人工确认的候选投影', () => {
  assert.deepEqual(mergeScreeningProjectionKeys(
    ['chronic|糖尿病|血糖'],
    [
      { status: 'resolved', resolvedScreeningKey: 'other|其他|新项目' },
      { status: 'dismissed', resolvedScreeningKey: 'other|其他|不应保留' },
    ],
  ), ['chronic|糖尿病|血糖', 'other|其他|新项目']);
});
