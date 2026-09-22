const test = require('node:test'), assert = require('node:assert/strict');
const { effectiveLifestyle } = require('../src/utils/effectiveLifestyle');
const confirmed = { path: 'lifestyle_data.breakfastTime', to: '08:00', sourceType: 'questionnaire', confirmedBy: 'staff', effectiveAt: '2026-09-22T01:00:00Z' };
test('confirmed questionnaire is visible without changing baseline or history', () => {
  const user = { lifestyle_data: {}, archiveVersionHistory: [confirmed] };
  assert.equal(effectiveLifestyle(user).breakfastTime, '08:00'); assert.deepEqual(user.lifestyle_data, {});
});
test('later manual correction including clear wins; unconfirmed fields ignored', () => {
  const user = { archiveVersionHistory: [confirmed, { ...confirmed, path: 'lifestyle_data.__proto__' }, { ...confirmed, path: 'lifestyle_data.dailyWater', confirmedBy: null }],
    lifestyleHistory: [{ recordedAt: '2026-09-22T02:00:00Z', changes: { lifestyle_data: { breakfastTime: { to: '' } } } }] };
  assert.equal(effectiveLifestyle(user).breakfastTime, ''); assert.equal(effectiveLifestyle(user).dailyWater, undefined);
});
test('later confirmed questionnaire wins over older manual edit', () => {
  assert.equal(effectiveLifestyle({ lifestyle_data: { breakfastTime: 'old' }, archiveVersionHistory: [confirmed],
    lifestyleHistory: [{ recordedAt: '2026-09-21', changes: { lifestyle_data: { breakfastTime: { to: '07:00' } } } }] }).breakfastTime, '08:00');
});
