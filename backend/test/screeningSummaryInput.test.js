const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSummaryInputGroups, projectNameForItem, resolveConfiguredProjectName,
  ensureLpla2InCardiovascularSummary, buildDeterministicSummary, isNormalOnlyConclusion,
} = require('../src/utils/screeningSummaryInput');

const tumorBucket = () => 'tumor_risk';

test('同一筛查项目跨报告合并为一组', () => {
  const reports = [
    { _id: 'r1', reportItems: [{ name: '肝脏超声', itemType: 'imaging', status: 'attention', conclusion: '脂肪肝', screeningParent: '肝癌早筛' }] },
    { _id: 'r2', reportItems: [{ name: '肝纤维弹性超声', itemType: 'imaging', status: 'abnormal', conclusion: '肝脏硬度值增高', screeningParent: '肝癌早筛' }] },
  ];
  const groups = buildSummaryInputGroups(reports, 'tumor_risk', tumorBucket);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].projectName, '肝癌早筛');
  assert.deepEqual(groups[0].reportIds, ['r1', 'r2']);
  assert.equal(groups[0].conclusions.length, 2);
});

test('旧数据中误挂到肝癌早筛的脾脏影像按器官纠正', () => {
  const item = {
    name: '脾脏超声', bodyPart: '脾脏', itemType: 'imaging',
    screeningParent: '肝癌早筛', conclusion: '脾形态大小正常，脾内回声均匀细小。',
  };
  assert.equal(projectNameForItem(item, {}), '胰腺-胆囊-脾脏癌早筛');
});

test('年度小结输入只保留异常和需关注项目', () => {
  const reports = [{
    _id: 'r1', reportItems: [
      { name: '正常项', status: 'normal', screeningParent: '肝癌早筛' },
      { name: '阴性项', status: 'normal', screeningParent: '肝癌早筛' },
      { name: '异常项', status: 'abnormal', screeningParent: '肝癌早筛' },
      { name: '关注项', status: 'attention', screeningParent: '肝癌早筛' },
    ],
  }];
  const groups = buildSummaryInputGroups(reports, 'tumor_risk', tumorBucket);
  assert.deepEqual(groups[0].conclusions.map(item => item.name), ['异常项', '关注项']);
});

test('综合腹部影像不根据结论中的相邻器官词误改项目', () => {
  const item = {
    name: '肝脏超声', itemType: 'imaging', screeningKey: 'tumor|肝癌早筛|肝脏超声',
    conclusion: '肝脏未见异常，脾脏未见异常。',
  };
  assert.equal(projectNameForItem(item, {}), '肝癌早筛');
});

test('脾脏项目兼容线上旧目录名称并保持目录顺序', () => {
  const order = new Map([['肝癌早筛', 3], ['胰腺-胆囊癌早筛（脾）', 8]]);
  assert.equal(resolveConfiguredProjectName('胰腺-胆囊-脾脏癌早筛', order), '胰腺-胆囊癌早筛（脾）');
});

test('脑血管病小结遗漏异常脂蛋白磷脂酶A2时确定性补入原项目行', () => {
  const groups = [{
    projectName: '脑血管病早筛',
    conclusions: [{ name: '脂蛋白磷脂酶A2', value: '280 ng/mL', status: 'abnormal', conclusion: '' }],
  }];
  const result = ensureLpla2InCardiovascularSummary(
    '心血管病早筛：常规心电图正常。\n脑血管病早筛：双侧颈动脉内膜毛糙增厚。',
    groups,
  );
  assert.equal(result, '心血管病早筛：常规心电图正常。\n脑血管病早筛：双侧颈动脉内膜毛糙增厚；脂蛋白磷脂酶A2异常（280 ng/mL）。');
});

test('正常脂蛋白磷脂酶A2不追加到年度异常小结', () => {
  const groups = [{
    projectName: '脑血管病早筛',
    conclusions: [{ name: '脂蛋白磷脂酶A2', value: '128 ng/mL', status: 'normal', conclusion: '' }],
  }];
  assert.equal(ensureLpla2InCardiovascularSummary('脑血管病早筛：颈动脉斑块。', groups), '脑血管病早筛：颈动脉斑块。');
});

test('脑血管病小结已有脂蛋白磷脂酶A2时不重复追加', () => {
  const summary = '脑血管病早筛：脂蛋白磷脂酶A2正常；颈动脉内膜毛糙。';
  const groups = [{
    projectName: '脑血管病早筛',
    conclusions: [{ name: 'Lp-PLA2', value: '128', status: 'normal', conclusion: '' }],
  }];
  assert.equal(ensureLpla2InCardiovascularSummary(summary, groups), summary);
});

test('检验项目只按异常和需关注状态纳入', () => {
  const reports = [{
    _id: 'r1', reportItems: [
      { name: '白蛋白', itemType: 'lab', value: '52.1', status: 'abnormal', screeningParent: '脏器功能筛查' },
      { name: '谷丙转氨酶', itemType: 'lab', value: '20', status: 'normal', screeningParent: '脏器功能筛查' },
    ],
  }];
  const groups = buildSummaryInputGroups(reports, 'tumor_risk', tumorBucket);
  assert.deepEqual(groups[0].conclusions.map(item => item.name), ['白蛋白']);
});

test('检查项目按主要结论纳入，不依赖异常状态', () => {
  const reports = [{
    _id: 'r1', reportItems: [
      { name: '心脏超声', itemType: 'imaging', status: 'unknown', conclusion: '左室舒张功能减低', screeningParent: '心血管病早筛' },
      { name: '胸部CT', itemType: 'imaging', status: 'abnormal', conclusion: '', diagnosis: '肺结节', screeningParent: '肺癌早筛' },
    ],
  }];
  const groups = buildSummaryInputGroups(reports, 'tumor_risk', tumorBucket);
  assert.deepEqual(groups.flatMap(group => group.conclusions).map(item => item.name), ['心脏超声']);
});

test('人工录入的检查单主要结论也纳入小结', () => {
  const reports = [{
    _id: 'r1', screeningL2: '肺癌早筛', reportItems: [],
    examMainConclusions: { '胸部低剂量CT': '右肺上叶磨玻璃结节' },
  }];
  const groups = buildSummaryInputGroups(reports, 'tumor_risk', tumorBucket);
  assert.equal(groups[0].conclusions[0].conclusion, '右肺上叶磨玻璃结节');
});

test('纯正常检查主要结论不纳入小结', () => {
  for (const conclusion of ['正常', '未见异常', '未见明显异常', '阴性', '大致正常', '未见占位', '心脏结构未见明显异常', '胸部CT平扫未见明显病变', '肝未见明显异常声像', '结论:1、阴性']) {
    assert.equal(isNormalOnlyConclusion(conclusion), true, conclusion);
  }
  const groups = buildSummaryInputGroups([{
    _id: 'r1', reportItems: [
      { name: '心脏超声', itemType: 'imaging', conclusion: '未见明显异常', screeningParent: '心血管病早筛' },
      { name: '胸部CT', itemType: 'imaging', conclusion: '未见占位', screeningParent: '肺癌早筛' },
    ],
  }], 'tumor_risk', tumorBucket);
  assert.deepEqual(groups, []);
});

test('同时含正常和异常的检查主要结论完整保留', () => {
  for (const conclusion of ['心脏大小正常，二尖瓣轻度反流', '双肺散在结节，其余未见异常', '肝未见明显异常声像，胆囊壁增厚']) {
    assert.equal(isNormalOnlyConclusion(conclusion), false, conclusion);
  }
});

test('确定性小结不遗漏肺CT异常', () => {
  const result = buildDeterministicSummary([{
    projectName: '肺癌早筛',
    conclusions: [{ name: '胸部低剂量CT', itemType: 'imaging', status: 'attention', conclusion: '右肺上叶磨玻璃结节' }],
  }]);
  assert.equal(result, '肺癌早筛：胸部低剂量CT：右肺上叶磨玻璃结节。');
});

test('确定性小结保留同项目的心脏超声等所有异常', () => {
  const result = buildDeterministicSummary([{
    projectName: '心血管病早筛',
    conclusions: [
      { name: '心脏超声', itemType: 'imaging', status: 'unknown', conclusion: '左室舒张功能减低' },
      { name: '常规心电图', itemType: 'lab', value: '窦性心动过缓', status: 'attention', conclusion: '' },
    ],
  }]);
  assert.match(result, /心脏超声：左室舒张功能减低/);
  assert.match(result, /常规心电图需关注（窦性心动过缓）/);
});
