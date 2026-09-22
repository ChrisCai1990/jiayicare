const test = require('node:test'), assert = require('node:assert/strict');
const { buildInitialCorrection } = require('../src/utils/archiveInitialCorrection');
const path = 'lifestyle_data.breakfastTime';
const fixture = () => ({ _id: 'u', lifestyle_data: {}, archiveVersionHistory: [1, 2].map(() => ({ path, from: '', to: '08:00', confirmedBy: 'a', sourceResponseId: 'r', sourceType: 'questionnaire' })), archiveConfirmLog: [{ sourceResponseId: 'r', mode: 'append_only', items: [{ path }] }] });
test('corrects duplicate first confirmation without losing original audit evidence', () => {
  const result = buildInitialCorrection(fixture(), 'r');
  assert.equal(result.count, 1); assert.equal(result.update.$set[path], '08:00');
  assert.equal(result.update.$set.archiveVersionHistory.length, 0);
  assert.equal(result.update.$set.archiveConfirmLog.at(-1).previousVersionEntries.length, 2);
});
test('refuses later manual change, different answer, or existing baseline', () => {
  for (const modify of [u => { u.lifestyle_data.breakfastTime = '07:00'; }, u => { u.archiveVersionHistory[1].to = '09:00'; }, u => { u.lifestyleHistory = [{ changes: { lifestyle_data: { breakfastTime: { to: '' } } } }]; }]) {
    const user = fixture(); modify(user); assert.throws(() => buildInitialCorrection(user, 'r'));
  }
});
test('explicit initial revision correction adopts latest review and retains every old version', () => {
  const user = fixture();
  user.archiveVersionHistory[0].effectiveAt = new Date('2026-09-22T01:00:00Z');
  user.archiveVersionHistory[1].effectiveAt = new Date('2026-09-22T02:00:00Z');
  user.archiveVersionHistory[1].to = '09:00';
  const result = buildInitialCorrection(user, 'r', { includeInitialRevisions: true });
  assert.equal(result.update.$set[path], '09:00');
  assert.equal(result.update.$set.archiveBaselineSources.lifestyle_data__breakfastTime.responseId, 'r');
  assert.equal(result.update.$set.archiveConfirmLog.at(-1).previousVersionEntries.length, 2);
  assert.equal(result.update.$set.archiveVersionHistory.length, 0);
});
