const test = require('node:test');
const assert = require('node:assert/strict');
const template = require('../src/utils/zheyiReportTemplate');

test('识别浙一报告但不误识别其他医院', () => {
  assert.equal(template.isZheyiReport({ hospital: '浙江大学医学院附属第一医院（庆春院区）' }), true);
  assert.equal(template.isZheyiReport({ title: '浙一2025年度体检报告' }), true);
  assert.equal(template.isZheyiReport({ hospital: '浙江大学医学院附属邵逸夫医院' }), false);
});

test('程序级页码范围固定为P6-P15', () => {
  for (let page = 1; page <= 5; page++) assert.equal(template.pageMode(page), 'skip');
  for (let page = 6; page <= 15; page++) assert.equal(template.pageMode(page), 'extract');
  for (let page = 16; page <= 28; page++) assert.equal(template.pageMode(page), 'duplicate');
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

test('归一化结果只保留P6-P15且保持原顺序', () => {
  const input = [{ name: '汇总', _page: 3 }, { name: '视力', _page: 6 }, { name: '白细胞计数', _page: 12 }, { name: '重复原件', _page: 17 }];
  assert.deepEqual(template.normalizeZheyiItems(input).map(item => item.name), ['视力', '白细胞计数']);
});

test('一般检查、科室名称和建议内容按固定规则归一化', () => {
  const rows = [
    { name: '心率', value: '72', itemType: 'data', _page: 6 },
    { name: '体重(kg)', value: '65', itemType: 'data', _page: 6 },
    { name: '龋齿', findings: '无', sourceSection: '口腔科', itemType: 'imaging', _page: 7 },
    { name: '心脏', findings: '正常', sourceSection: '内科', itemType: 'imaging', _page: 7 },
    { name: '痔疮', findings: '建议就诊', sourceSection: '外科', itemType: 'imaging', _page: 7 },
  ];
  const out = template.normalizeZheyiItems(rows);
  assert.ok(out.some(item => item.name === '脉搏心率'));
  assert.ok(out.some(item => item.name === '体重'));
  assert.ok(out.some(item => item.name === '牙科'));
  assert.ok(out.some(item => item.name === '内外科（全科）'));
  assert.ok(!out.some(item => /痔疮/.test(`${item.name} ${item.findings}`)));
});

test('眼压去重并将风险、骨密度、呼气试验转为检查项目', () => {
  const rows = [
    { name: '眼压', value: '左15 右16', itemType: 'data', _page: 8 },
    { name: '眼压检查', findings: '左眼15mmHg，右眼16mmHg', itemType: 'imaging', _page: 8 },
    { name: '糖尿病早期风险检测', value: '风险较低', itemType: 'lab', _page: 8 },
    { name: '骨密度测定', value: 'T值-1.0', itemType: 'lab', _page: 11 },
    { name: '13C尿素呼气试验', value: '阴性', itemType: 'lab', _page: 11 },
  ];
  const out = template.normalizeZheyiItems(rows);
  assert.equal(out.filter(item => item.name === '眼压检查').length, 1);
  for (const name of ['糖尿病早期风险检测', '骨密度', '碳13/14呼气试验']) {
    const item = out.find(row => row.name === name);
    assert.equal(item.itemType, 'imaging');
    assert.ok(item.findings);
  }
});

test('尿粪常规保留给统一聚合器处理，尿生化归尿肾功能', () => {
  const rows = [
    { name: '颜色', value: '黄褐色', referenceRange: '黄褐色', orderName: '粪便常规', itemType: 'lab', _page: 11 },
    { name: '隐血', value: '阴性', referenceRange: '阴性', orderName: '粪便常规', itemType: 'lab', _page: 11 },
    { name: '尿白细胞', value: '阴性', referenceRange: '阴性', orderName: '尿常规', itemType: 'lab', _page: 12 },
    { name: '尿微量白蛋白', value: '10', orderName: '尿生化', itemType: 'lab', _page: 12 },
  ];
  const out = template.normalizeZheyiItems(rows);
  assert.ok(out.some(item => item.name === '颜色' && item.orderName === '粪便常规'));
  assert.ok(out.some(item => item.name === '尿白细胞' && item.itemType === 'lab'));
  assert.equal(out.find(item => item.name === '尿微量白蛋白').orderName, '尿肾功能');
});
