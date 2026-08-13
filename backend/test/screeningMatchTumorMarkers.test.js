const test = require('node:test');
const assert = require('node:assert/strict');

const { norm, selectAdminMatches, selectMatchesForItem, authoritativePanelClassificationName } = require('../src/utils/screeningMatch');

function adminIndex(entries) {
  return entries.map(([id, label, aliases]) => ({
    node: { id, label, category: id.split('|')[0], parent: id.split('|')[1] },
    cands: [label, ...aliases].map(raw => ({ raw, n: norm(raw) })),
  }));
}

test('检测方法尾缀只能匹配Admin中已有的项目归类', () => {
  const index = adminIndex([
    ['tumor|肿瘤标志物|泛肿瘤标志物', '泛肿瘤标志物', ['糖类抗原19-9', '胃泌素释放肽前体', '恶性肿瘤特异性生长因子']],
  ]);
  for (const name of [
    '糖类抗原19-9(CA19-9)+(电化学发光法)',
    '胃泌素释放肽前体[ProGRP',
    '恶性肿瘤特异性生长因子(TSGF)+(速率法)',
  ]) {
    assert.equal(selectAdminMatches([name], 'lab', index)[0]?.node.label, '泛肿瘤标志物');
  }
});

test('代码不能创造Admin中不存在的分类', () => {
  assert.deepEqual(selectAdminMatches(['糖类抗原19-9(CA19-9)'], 'lab', []), []);
});

test('同分命中多个Admin分类时保持待归类', () => {
  const index = adminIndex([
    ['a|一类|项目A', '项目A', ['共同关键词']],
    ['b|二类|项目B', '项目B', ['共同关键词']],
  ]);
  assert.deepEqual(selectAdminMatches(['共同关键词'], 'lab', index), []);
});

test('乳酸脱氢酶按项目名优先，不能被肝功能栏目覆盖', () => {
  const index = adminIndex([
    ['heart|心肌酶|心肌酶谱', '心肌酶谱', ['乳酸脱氢酶', 'LDH']],
    ['liver|肝功能|肝功能', '肝功能', ['肝功能常规']],
  ]);
  const matches = selectMatchesForItem({ name: '乳酸脱氢酶', orderName: '肝功能常规', itemType: 'lab' }, index);
  assert.equal(matches[0]?.node.id, 'heart|心肌酶|心肌酶谱');
});

test('尿常规上下文覆盖同名葡萄糖的跨体系歧义', () => {
  assert.equal(authoritativePanelClassificationName({ name: '葡萄糖', sourceSection: '尿干化学' }), '尿常规');
});

test('碳13呼气试验即使OCR名称不完整也使用呼气试验归类原子', () => {
  assert.equal(authoritativePanelClassificationName({ name: '尿素呼气试验', orderName: '碳13呼气试验' }), '碳13呼气试验');
});
