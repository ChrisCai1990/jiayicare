const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_POLICY, budgetRefusalReason, budgetScopes } = require('../src/utils/aiBudgetPolicy');
const { assertSupplementCallCapacity } = require('../src/utils/aiBudget');
const { mergeSupplementItems } = require('../src/utils/reportPageSupplement');

test('report and page usage stay counted without cumulative call ceilings', () => {
  const scopes = budgetScopes(DEFAULT_POLICY, { business: 'ocr', reportId: 'r', page: 1 }, new Date());
  for (const scope of scopes.slice(-2)) {
    assert.equal(scope.calls, undefined);
    assert.equal(budgetRefusalReason(scope, { calls: 1000, tokens: 24922 }, 27912, 0, 8), '');
  }
});

test('supplement preflight ignores accumulated page calls but keeps daily protection', async () => {
  const db = { policy: async () => DEFAULT_POLICY, counter: async id => ({ calls: id.startsWith('page:') ? 1000 : 0 }) };
  await assertSupplementCallCapacity({ reportId: 'r', page: 1 }, db, 8);
  db.counter = async id => ({ calls: id.startsWith('day:') ? DEFAULT_POLICY.dailyCalls - 4 : 1000 });
  await assert.rejects(assertSupplementCallCapacity({ reportId: 'r', page: 1 }, db, 8), /今日总预算调用次数不足/);
});

test('supplement fills a missing field without replacing existing or reviewed prose', () => {
  const original = { itemId: 'one', name: '心脏彩超', itemType: 'imaging', findings: '原所见', diagnosis: '' };
  const candidate = { ...original, findings: '另一段所见', diagnosis: '原文结论' };
  const merged = mergeSupplementItems([original], [candidate]);
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].findings, '原所见');
  assert.equal(merged.items[0].diagnosis, '原文结论');
  assert.equal(merged.enriched.length, 1);
  const reviewed = { ...original, manualReviewStatus: 'reviewed' };
  assert.deepEqual(mergeSupplementItems([reviewed], [candidate]).items, [reviewed]);
});
