const test = require('node:test');
const assert = require('node:assert/strict');
const { extractJsonObject, normalizeGeneratedDraft } = require('../src/utils/productAiDraft');

test('extractJsonObject accepts plain and fenced JSON', () => {
  assert.deepEqual(extractJsonObject('{"targetNeeds":["控糖"]}'), { targetNeeds: ['控糖'] });
  assert.deepEqual(extractJsonObject('```json\n{"targetNeeds":["控糖"]}\n```'), { targetNeeds: ['控糖'] });
});

test('generated product rules are normalized and never auto-enabled', () => {
  const draft = normalizeGeneratedDraft({ enabledForRecommendation: true, targetNeeds: [' 控糖 ', '控糖', ''], suitableFor: 'not-an-array', nextAction: 'buy', operatorNotes: 'model text' });
  assert.equal(draft.enabledForRecommendation, false);
  assert.deepEqual(draft.targetNeeds, ['控糖']);
  assert.deepEqual(draft.suitableFor, []);
  assert.equal(draft.nextAction, 'buy');
  assert.equal(draft.operatorNotes, '');
});
