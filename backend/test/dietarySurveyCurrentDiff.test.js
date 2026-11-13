const test = require('node:test');
const assert = require('node:assert/strict');
const { buildArchiveDraft } = require('../src/utils/archiveImport');
const { effectiveLifestyle } = require('../src/utils/effectiveLifestyle');

test('dietary answer difference is measured against confirmed lifestyle, not original baseline', () => {
  const user = {
    lifestyle_data: { breakfastTime: '07:00' },
    lifestyleHistory: [{ recordedAt: '2026-11-01T09:00:00Z', changes: {
      lifestyle_data: { breakfastTime: { from: '07:00', to: '08:00' } },
    } }],
  };
  const questionnaire = { _id: 'survey', title: '膳食调查问卷', questions: [
    { id: 'breakfast', text: '早餐时间', archiveField: 'lifestyle_data.breakfastTime' },
  ] };
  const response = { _id: 'response', answers: { breakfast: '09:00' } };
  const draft = buildArchiveDraft({ ...user, lifestyle_data: effectiveLifestyle(user) }, questionnaire, response);
  assert.equal(draft.items[0].existing, '08:00');
  assert.equal(draft.items[0].valueStr, '09:00');
  assert.equal(draft.items[0].conflict, true);
  assert.equal(user.lifestyle_data.breakfastTime, '07:00');
});
