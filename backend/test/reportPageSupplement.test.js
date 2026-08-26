const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalReportItemName, filterSupplementCandidates } = require('../src/utils/reportPageSupplement');

test('超声名称变体归一为同一项目', () => {
  assert.equal(canonicalReportItemName('甲状腺彩超'), canonicalReportItemName('甲状腺超声检查'));
});

test('单页补提不重复加入已有影像项目', () => {
  const result = filterSupplementCandidates(
    [{ name: '甲状腺彩超', itemType: 'imaging', bodyPart: '甲状腺' }],
    [{ name: '甲状腺超声检查', itemType: 'imaging', bodyPart: '甲状腺', findings: '双叶见结节', sourceEvidence: '甲状腺超声检查 双叶见结节' }],
  );
  assert.equal(result.length, 0);
});

test('影像补提没有可复核连续原文时拒绝入库', () => {
  assert.equal(filterSupplementCandidates([], [{ name: '腹部超声', itemType: 'imaging', findings: '脂肪肝' }]).length, 0);
  assert.equal(filterSupplementCandidates([], [{ name: '腹部超声', itemType: 'imaging', findings: '脂肪肝', sourceEvidence: '腹部超声 肝脏回声增强' }]).length, 0);
});

test('有项目名和结果原文证据的影像候选可补入', () => {
  assert.equal(filterSupplementCandidates([], [{ name: '腹部超声', itemType: 'imaging', findings: '肝脏回声增强', sourceEvidence: '腹部超声 肝脏回声增强' }]).length, 1);
});
