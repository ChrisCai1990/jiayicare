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
