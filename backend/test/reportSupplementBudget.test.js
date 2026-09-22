const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_POLICY, budgetRefusalReason } = require('../src/utils/aiBudgetPolicy');
const { assertSupplementCallCapacity } = require('../src/utils/aiBudget');
const { mergeSupplementItems } = require('../src/utils/reportPageSupplement');

test('page call limit is distinguished from token limit', () => {
  const scope = { label: '第 1 页累计预算', calls: 8, tokens: 160000 };
  assert.match(budgetRefusalReason(scope, { calls: 8, tokens: 24922 }, 27912), /调用次数不足.*8\/8/);
  assert.match(budgetRefusalReason(scope, { calls: 1, tokens: 159000 }, 27912), /Token 不足/);
  assert.equal(budgetRefusalReason(scope, { calls: 8, extraCalls: 3, tokens: 24922 }, 27912, 0, 3), '');
});

test('supplement refuses before starting when independent verification cannot fit', async () => {
  let extraCalls = 0;
  const db = { policy: async () => DEFAULT_POLICY, counter: async id => id.startsWith('page:') ? { calls: 7, tokens: 24922, extraCalls } : {} };
  await assert.rejects(assertSupplementCallCapacity({ reportId: 'r', page: 1 }, db), error => error.code === 'AI_PAGE_BUDGET_PAUSED' && /需要 3 次/.test(error.message));
  extraCalls = 2;
  await assertSupplementCallCapacity({ reportId: 'r', page: 1 }, db);
  assert.equal(extraCalls, 2); // Preflight never resets or increases the allowance.
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
