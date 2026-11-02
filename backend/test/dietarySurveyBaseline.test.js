const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMutation } = require('../src/utils/dietarySurveyBaseline');
const { effectiveLifestyle } = require('../src/utils/effectiveLifestyle');

const questionnaire = { _id: '6a49eab9fc1595013da70645', questions: [
  { id: 'breakfast', text: '早餐时间', archiveField: 'lifestyle_data.breakfastTime' },
  { id: 'lunch', text: '午餐时间', archiveField: 'lifestyle_data.lunchTime' },
] };
const response = { _id: 'answer-1', submittedAt: new Date('2026-10-31'),
  answers: { breakfast: '08:00', lunch: '12:00' } };

test('customer dietary answer establishes only empty lifestyle fields with source', () => {
  const user = { _id: 'patient', lifestyle_data: { breakfastTime: '07:00' },
    archiveBaselineSources: {}, lifestyleHistory: [], archiveVersionHistory: [] };
  const mutation = buildMutation(user, questionnaire, response);
  assert.equal(mutation.update.$set['lifestyle_data.breakfastTime'], undefined);
  assert.equal(mutation.update.$set['lifestyle_data.lunchTime'], '12:00');
  assert.equal(mutation.update.$set.archiveBaselineSources.lifestyle_data__lunchTime.responseId, 'answer-1');
});

test('later specialist revision remains authoritative and original baseline is retained', () => {
  const user = { _id: 'patient', lifestyle_data: { breakfastTime: '08:00' },
    archiveBaselineSources: { lifestyle_data__breakfastTime: { responseId: 'answer-1' } },
    lifestyleHistory: [{ recordedAt: new Date('2026-11-01'), changes: {
      lifestyle_data: { breakfastTime: { from: '08:00', to: '09:00' } } } }], archiveVersionHistory: [] };
  assert.equal(effectiveLifestyle(user).breakfastTime, '09:00');
  assert.equal(buildMutation(user, questionnaire, response).update.$set['lifestyle_data.breakfastTime'], undefined);
  assert.equal(user.lifestyle_data.breakfastTime, '08:00');
});
