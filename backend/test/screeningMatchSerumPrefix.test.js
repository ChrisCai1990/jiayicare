const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classificationCandidates,
  hasConfirmedClassification,
  matchAllWithIndex,
  norm,
  selectAdminMatches,
  selectMatchesForItem,
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

test('关键词包含匹配也只能返回Admin索引里的真实分类', () => {
  const id = 'other|传染病筛查|其他传染病检测';
  const index = [{
    node: { id, label: '其他传染病检测', category: 'other', parent: '传染病筛查' },
    cands: ['其他传染病检测', '人免疫缺陷病毒抗体（ELISA）', '丙型肝炎抗体']
      .map(raw => ({ raw, n: norm(raw) })),
  }];
  assert.equal(selectAdminMatches(['人免疫缺陷病毒抗体'], 'lab', index)[0]?.node.id, id);
  assert.equal(selectAdminMatches(['丙型肝炎抗体'], 'lab', index)[0]?.node.id, id);
});

test('已有归类标识的项目视为已确认，待归类项目才继续匹配', () => {
  assert.equal(hasConfirmedClassification({ screeningKey: 'a|b|c' }), true);
  assert.equal(hasConfirmedClassification({ screeningKeys: ['a|b|c'] }), true);
  assert.equal(hasConfirmedClassification({ matchStatus: 'matched' }), true);
  assert.equal(hasConfirmedClassification({ matchStatus: 'unclassified', screeningKeys: [] }), false);
});

test('项目名关键词命中优先于所属栏目精确命中', () => {
  const heartId = 'cardio|心血管病早筛|心肌酶谱+利钠肽（BNP）';
  const liverId = 'chronic|脏器功能筛查|肝功能';
  const index = [
    {
      node: { id: heartId, label: '心肌酶谱+利钠肽（BNP）', category: 'cardio', parent: '心血管病早筛' },
      cands: ['心肌酶谱+利钠肽（BNP）', '乳酸脱氢酶（LDH）'].map(raw => ({ raw, n: norm(raw) })),
    },
    {
      node: { id: liverId, label: '肝功能', category: 'chronic', parent: '脏器功能筛查' },
      cands: [{ raw: '肝功能', n: norm('肝功能') }],
    },
  ];

  const matches = selectMatchesForItem({ itemType: 'lab', name: '乳酸脱氢酶', orderName: '酶学检查', sourceSection: '肝功能' }, index);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].node.id, heartId);
});

test('仅当项目名无法命中Admin时才使用栏目兜底', () => {
  const index = [{
    node: { id: 'chronic|脏器功能筛查|肝功能', label: '肝功能', category: 'chronic', parent: '脏器功能筛查' },
    cands: [{ raw: '肝功能', n: norm('肝功能') }],
  }];
  const matches = selectMatchesForItem({ itemType: 'lab', name: '未知指标', sourceSection: '肝功能' }, index);
  assert.equal(matches[0]?.node.label, '肝功能');
});

test('项目名未命中时禁止使用混合套餐名猜分类', () => {
  const index = [{
    node: { id: 'functional|维生素及电解质类|电解质', label: '电解质', category: 'functional', parent: '维生素及电解质类' },
    cands: [{ raw: '电解质', n: norm('电解质') }],
  }];
  const matches = selectMatchesForItem({ itemType: 'lab', name: '胰岛素-0小时', orderName: '胰岛素/电解质测定' }, index);
  assert.deepEqual(matches, []);
});

test('科室体检明细优先归入Admin现有科室分类', () => {
  const eyeId = 'general|眼科检查|眼科检查';
  const entId = 'general|耳鼻喉检查|耳鼻喉科检查';
  const generalId = 'general|一般检查|内外科（全科）';
  const unrelatedId = 'functional|肠道与健康|慢性食物过敏（功能医学）';
  const index = [
    { node: { id: eyeId, label: '眼科检查' }, cands: [{ raw: '眼科检查', n: norm('眼科检查') }] },
    { node: { id: entId, label: '耳鼻喉科检查' }, cands: [{ raw: '耳鼻喉科检查', n: norm('耳鼻喉科检查') }] },
    { node: { id: generalId, label: '内外科（全科）' }, cands: [{ raw: '内外科（全科）', n: norm('内外科（全科）') }] },
    { node: { id: unrelatedId, label: '慢性食物过敏（功能医学）' }, cands: [{ raw: '其他', n: norm('其他') }] },
  ];

  assert.equal(selectMatchesForItem({ name: '左眼裸视力', itemType: 'imaging', sourceSection: '眼科精英检查' }, index)[0]?.node.id, eyeId);
  assert.equal(selectMatchesForItem({ name: '现病史(耳鼻喉科)', itemType: 'imaging', sourceSection: '精英耳鼻喉科' }, index)[0]?.node.id, entId);
  assert.equal(selectMatchesForItem({ name: '其他', itemType: 'imaging', sourceSection: '内科普通检查' }, index)[0]?.node.id, generalId);
});

test('Admin不存在科室分类时保持未归类，不自由生成', () => {
  const index = [{
    node: { id: 'photo|眼底照相|眼底照相', label: '眼底照相' },
    cands: [{ raw: '眼底照相', n: norm('眼底照相') }],
  }];
  assert.deepEqual(selectMatchesForItem({ name: '左眼裸视力', itemType: 'imaging', sourceSection: '眼科精英检查' }, index), []);
});
