const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classificationCandidates,
  matchAllWithIndex,
} = require('../src/utils/screeningMatch');

test('血清前缀作为新增候选，不替换报告原名', () => {
  const cases = [
    ['血清碱性磷酸酶', '碱性磷酸酶'],
    ['血清肌酸激酶', '肌酸激酶'],
    ['血清肌酸激酶同工酶', '肌酸激酶同工酶'],
    ['血清总蛋白', '总蛋白'],
    ['血清白蛋白', '白蛋白'],
    ['血清白球比', '白球比'],
    ['血清天门冬氨酸氨基转移酶', '天门冬氨酸氨基转移酶'],
    ['血清丙氨酸氨基转移酶', '丙氨酸氨基转移酶'],
    ['血清总胆红素', '总胆红素'],
    ['血清直接胆红素', '直接胆红素'],
    ['血清间接胆红素', '间接胆红素'],
    ['血清γ-谷氨酰基转移酶', 'γ-谷氨酰基转移酶'],
  ];

  for (const [raw, stripped] of cases) {
    const candidates = classificationCandidates({ itemType: 'lab', name: raw });
    assert.ok(candidates.includes(raw), `${raw}应保留原名`);
    assert.ok(candidates.includes(stripped), `${raw}应增加${stripped}`);
  }
});

test('去血清前缀候选可以精确命中Admin已有项目名', () => {
  const index = [{
    node: { id: 'liver|肝功能', label: '总蛋白', category: 'liver', parent: '肝功能' },
    cands: [{ raw: '总蛋白', n: '总蛋白' }],
  }];
  const matches = classificationCandidates({ itemType: 'lab', name: '血清总蛋白' })
    .flatMap(name => matchAllWithIndex(name, 'lab', index, 1, []));

  assert.equal(matches.length, 1);
  assert.equal(matches[0].node.label, '总蛋白');
});

test('非血清开头的项目不生成截断候选', () => {
  assert.deepEqual(classificationCandidates({ itemType: 'lab', name: '血小板计数' }), ['血小板计数']);
});

test('乙肝抗原抗体定量名称新增乙肝三系候选', () => {
  const names = [
    '乙型肝炎表面抗体定量',
    '乙型肝炎e抗原定量',
    '乙型肝炎e抗体定量',
    '乙型肝炎核心抗体定量',
    '乙型肝炎病毒表面抗原测定',
  ];

  for (const name of names) {
    const candidates = classificationCandidates({ itemType: 'lab', name });
    assert.ok(candidates.includes(name), `${name}应保留原名`);
    assert.ok(candidates.includes('乙肝三系'), `${name}应新增乙肝三系候选`);
  }
});

test('其他肝炎抗体不误归入乙肝三系', () => {
  assert.deepEqual(
    classificationCandidates({ itemType: 'lab', name: '丙型肝炎病毒抗体' }),
    ['丙型肝炎病毒抗体'],
  );
});

test('总和游离前列腺特异性抗原新增男性特定肿瘤标志物候选', () => {
  const names = [
    '总前列腺特异性抗原',
    '游离前列腺特异性抗原',
    '总前列腺特异抗原',
    '游离前列腺抗原比值',
    'TPSA',
    'FPSA',
    'T-PSA',
    'F-PSA',
    'FPSA/TPSA',
  ];

  for (const name of names) {
    const candidates = classificationCandidates({ itemType: 'lab', name });
    assert.ok(candidates.includes(name), `${name}应保留原名`);
    assert.ok(candidates.includes('男性特定肿瘤标志物'), `${name}应新增男性特定肿瘤标志物候选`);
  }
});

test('普通前列腺检查不误归入男性特定肿瘤标志物', () => {
  assert.deepEqual(
    classificationCandidates({ itemType: 'imaging', name: '前列腺超声' }),
    ['前列腺超声'],
  );
});
