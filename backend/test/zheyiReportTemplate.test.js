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
  assert.match(prompt, /每个科室只输出一条/);
  assert.match(prompt, /科室小结.*全部跳过/);
  assert.match(prompt, /肝脏超声、胆囊超声、脾脏超声、胰腺超声四条/);
});

test('科室内部项目合并成换行文本且小结不进入结果', () => {
  const rows = [
    { name: '视力', sourceSection: '眼科检查', findings: '左眼1.0 右眼1.0', itemType: 'imaging', _page: 6, _order: 1 },
    { name: '色觉', sourceSection: '眼科检查', findings: '正常', itemType: 'imaging', _page: 6, _order: 2 },
    { name: '科室小结', sourceSection: '眼科检查', findings: '健康建议', itemType: 'imaging', _page: 6, _order: 3 },
  ];
  const out = template.normalizeZheyiItems(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, '眼科检查');
  assert.equal(out[0].findings, '视力：左眼1.0 右眼1.0\n色觉：正常');
});

test('组合超声拆成器官记录并规范关键检查名称', () => {
  const rows = [
    { name: '肝胆脾胰彩超', sourceSection: '肝胆脾胰彩超', findings: '肝外形饱满，实质回声增强。胆囊外形正常。脾外形正常。胰腺显示部分正常。', diagnosis: '脂肪肝', itemType: 'imaging', _page: 9, _order: 1 },
    { name: '肺部HR CT平扫', findings: '两肺所见', itemType: 'imaging', _page: 9, _order: 2 },
    { name: '膀胱+前列腺（彩超）', findings: '膀胱充盈尚可。前列腺大小约4.5cm。', diagnosis: '前列腺增生', itemType: 'imaging', _page: 10, _order: 1 },
  ];
  const names = template.normalizeZheyiItems(rows).map(row => row.name);
  for (const expected of ['肝脏超声', '胆囊超声', '脾脏超声', '胰腺超声', '胸部（低剂量螺旋）CT', '膀胱超声', '前列腺超声']) assert.ok(names.includes(expected), expected);
});

test('肿瘤、肝纤维化和维生素项目写入正确检验组', () => {
  const rows = [
    { name: '游离前列腺特异抗原', itemType: 'lab', _page: 13 },
    { name: '糖抗原19-9', itemType: 'lab', _page: 13 },
    { name: '层黏连蛋白', itemType: 'lab', _page: 15 },
    { name: '壳多糖酶3样蛋白1(CHI3L1)', itemType: 'lab', _page: 15 },
    { name: '维生素K1', itemType: 'lab', _page: 15 },
  ];
  const groups = Object.fromEntries(template.normalizeZheyiItems(rows).map(row => [row.name, row.orderName]));
  assert.equal(groups['游离前列腺特异抗原'], '男性特定肿瘤标志物');
  assert.equal(groups['糖抗原19-9'], '泛肿瘤标志物');
  assert.equal(groups['层黏连蛋白'], '肝纤维化指标');
  assert.equal(groups['壳多糖酶3样蛋白1(CHI3L1)'], '肝纤维化指标');
  assert.equal(groups['维生素K1'], '其他维生素类');
});

test('归一化结果只保留P6-P16且保持原顺序', () => {
  const input = [{ name: '汇总', _page: 3 }, { name: '视力', _page: 6 }, { name: '白细胞计数', _page: 12 }, { name: '重复原件', _page: 17 }];
  assert.deepEqual(template.normalizeZheyiItems(input).map(item => item.name), ['视力', '白细胞计数']);
});
