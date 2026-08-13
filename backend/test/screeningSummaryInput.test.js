const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSummaryInputGroups, projectNameForItem, resolveConfiguredProjectName,
  ensureLpla2InCardiovascularSummary,
} = require('../src/utils/screeningSummaryInput');

const tumorBucket = () => 'tumor_risk';

test('同一筛查项目跨报告合并为一组', () => {
  const reports = [
    { _id: 'r1', reportItems: [{ name: '肝脏超声', itemType: 'imaging', status: 'attention', screeningParent: '肝癌早筛' }] },
    { _id: 'r2', reportItems: [{ name: '肝纤维弹性超声', itemType: 'imaging', status: 'abnormal', screeningParent: '肝癌早筛' }] },
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
