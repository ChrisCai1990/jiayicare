const test = require('node:test');
const assert = require('node:assert/strict');
const template = require('../src/utils/zheyiReportTemplate');

test('识别浙一报告但不误识别其他医院', () => {
  assert.equal(template.isZheyiReport({ hospital: '浙江大学医学院附属第一医院（庆春院区）' }), true);
  assert.equal(template.isZheyiReport({ title: '浙一2025年度体检报告' }), true);
  assert.equal(template.isZheyiReport({ hospital: '浙江大学医学院附属邵逸夫医院' }), false);
});

test('程序级页码范围固定为P6-P16', () => {
  for (let page = 1; page <= 5; page++) assert.equal(template.pageMode(page), 'skip');
  for (let page = 6; page <= 16; page++) assert.equal(template.pageMode(page), 'extract');
  for (let page = 17; page <= 28; page++) assert.equal(template.pageMode(page), 'duplicate');
});

test('适配提示强制科室逐行、小结跳过、腹部超声拆分', () => {
  const prompt = template.promptForPage(6);
  assert.match(prompt, /每一个“项目名称”逐行输出/);
  assert.match(prompt, /科室小结.*全部跳过/);
  assert.match(prompt, /肝脏超声、胆囊超声、脾脏超声、胰腺超声四条/);
});

test('归一化结果只保留P6-P16且保持原顺序', () => {
  const input = [{ name: '汇总', _page: 3 }, { name: '视力', _page: 6 }, { name: '白细胞计数', _page: 12 }, { name: '重复原件', _page: 17 }];
  assert.deepEqual(template.normalizeZheyiItems(input).map(item => item.name), ['视力', '白细胞计数']);
});
