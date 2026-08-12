const test = require('node:test');
const assert = require('node:assert/strict');
const { matchAll, matchAllWithIndex, classificationCandidates, norm } = require('../src/utils/screeningMatch');
const { REPORT_CLASSIFICATION_ALIASES } = require('../src/utils/reportClassificationAliases');

const node = { id: 'l1|parent|leaf', label: '电解质', aliases: ['钙'], category: 'l1', parent: 'parent', itemType: null };
const index = [{ node, cands: ['电解质', '钙'].map(raw => ({ raw, n: raw })) }];

test('静态分类接口不再产生归类结果', () => {
  assert.deepEqual(matchAll('电解质', 'lab'), []);
});

test('Admin分类名称或别名精确命中', () => {
  assert.equal(matchAllWithIndex('钙', 'lab', index, 1, []).length, 1);
  assert.equal(matchAllWithIndex('电解质', 'lab', index, 1, []).length, 1);
});

test('模糊包含不自动命中', () => {
  assert.deepEqual(matchAllWithIndex('血清钙结果', 'lab', index, 1, []), []);
});

test('只使用报告原始名称、检验单名和栏目名作为Admin查询候选', () => {
  assert.deepEqual(classificationCandidates({ name: '颜色', orderName: '粪便常规', sourceSection: '检验报告' }), ['颜色', '粪便常规', '检验报告']);
});

test('真实报告变体通过Admin别名字典精确匹配', () => {
  for (const [label, aliases] of Object.entries(REPORT_CLASSIFICATION_ALIASES)) {
    const exactIndex = [{ node: { id: label, label, aliases }, cands: [label, ...aliases].map(raw => ({ raw, n: norm(raw) })) }];
    aliases.forEach(alias => assert.equal(matchAllWithIndex(alias, 'lab', exactIndex, 1, []).length, 1, `${label}: ${alias}`));
  }
});
