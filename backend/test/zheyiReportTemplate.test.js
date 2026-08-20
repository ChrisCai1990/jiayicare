const test = require('node:test');
const assert = require('node:assert/strict');
const template = require('../src/utils/zheyiReportTemplate');

test('识别浙一报告但不误识别其他医院', () => {
  assert.equal(template.isZheyiReport({ hospital: '浙江大学医学院附属第一医院之江院区' }), true);
  assert.equal(template.isZheyiReport({ title: '浙一2025年度体检报告' }), true);
  assert.equal(template.isZheyiReport({ hospital: '浙江大学医学院附属邵逸夫医院' }), false);
});

test('医院模板不再按固定页码跳过真实报告内容', () => {
  for (let page = 1; page <= 28; page++) assert.equal(template.pageMode(page), 'extract');
});

test('提示只辅助识别版式，不根据医院和页码推断内容', () => {
  const prompt = template.promptForPage(6);
  assert.match(prompt, /绝不能据此推断本页项目或跳过任何页/);
  assert.match(prompt, /当前图片实际可见/);
  assert.match(prompt, /逐栏逐行提取/);
  assert.match(prompt, /页码6不代表固定项目/);
});

test('归一化保留所有页面的真实项目和原始顺序', () => {
  const input = [
    { name: '汇总页项目', _page: 3, itemType: 'lab' },
    { name: '视力', _page: 6, itemType: 'data' },
    { name: '白细胞计数', _page: 12, itemType: 'lab' },
    { name: '附加页项目', _page: 17, itemType: 'lab' },
  ];
  assert.deepEqual(template.normalizeZheyiItems(input).map(item => item.name), input.map(item => item.name));
});

test('空页或缺少有效内容时触发覆盖复核', () => {
  assert.equal(template.needsCoverageAudit(6, []), true);
  assert.equal(template.needsCoverageAudit(6, [{ name: '白细胞计数', value: '', _page: 6 }]), true);
  assert.equal(template.needsCoverageAudit(6, [{ name: '白细胞计数', value: '5.6', _page: 6 }]), false);
});
