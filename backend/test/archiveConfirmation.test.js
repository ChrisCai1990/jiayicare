const test = require('node:test'), assert = require('node:assert/strict');
const { buildConfirmation } = require('../src/utils/archiveConfirmation');
const path = 'lifestyle_data.breakfastTime';
const fixture = () => ({ _id: 'u', archiveDraft: { responseId: 'r', questionnaireId: 'q', items: [{ path }] }, lifestyle_data: {} });
const actor = { _id: 'a' };
test('first confirmation writes baseline, no change history', () => {
  const result = buildConfirmation(fixture(), [{ path, value: '08:00' }], actor);
  assert.equal(result.initialCount, 1); assert.equal(result.update.$set[path], '08:00');
  assert.equal(result.update.$push.archiveVersionHistory, undefined);
  assert.equal(result.update.$push.archiveConfirmLog.$each[0].mode, 'initial');
});
test('existing baseline records only changed fields and is never overwritten', () => {
  const user = fixture(); user.lifestyle_data.breakfastTime = '07:00';
  const result = buildConfirmation(user, [{ path, value: '08:00' }], actor);
  assert.equal(result.initialCount, 0); assert.equal(result.changeCount, 1); assert.equal(result.update.$set[path], undefined);
  assert.equal(result.update.$push.archiveVersionHistory.$each[0].from, '07:00');
  assert.equal(buildConfirmation(user, [{ path, value: '07:00' }], actor).changeCount, 0);
});
test('previously confirmed empty value remains baseline, not another first entry', () => {
  const user = fixture(); user.archiveConfirmLog = [{ items: [{ path, value: '' }] }];
  assert.equal(buildConfirmation(user, [{ path, value: '08:00' }], actor).initialCount, 0);
});
test('cleared draft, arbitrary and duplicate fields cannot confirm', () => {
  assert.throws(() => buildConfirmation({ ...fixture(), archiveDraft: null }, [], actor), { statusCode: 409 });
  assert.throws(() => buildConfirmation(fixture(), [{ path: 'name', value: 'x' }], actor), { statusCode: 400 });
  assert.throws(() => buildConfirmation(fixture(), [{ path, value: 'a' }, { path, value: 'b' }], actor), { statusCode: 400 });
});
test('same initial response revisions update baseline, a new response creates changes', () => {
  const user = fixture(); user.lifestyle_data.breakfastTime = '08:00';
  user.archiveBaselineSources = { lifestyle_data__breakfastTime: { responseId: 'r', value: '08:00' } };
  const revised = buildConfirmation(user, [{ path, value: '09:00' }], actor);
  assert.equal(revised.update.$set[path], '09:00'); assert.equal(revised.changeCount, 0);
  assert.equal(revised.update.$push.archiveConfirmLog.$each[0].items[0].mode, 'initial_revision');
  user.archiveDraft.responseId = 'new';
  const subsequent = buildConfirmation(user, [{ path, value: '09:00' }], actor);
  assert.equal(subsequent.initialCount, 0); assert.equal(subsequent.changeCount, 1);
  assert.equal(subsequent.update.$set[path], undefined);
});
test('old initial response cannot overwrite later staff or questionnaire updates', () => {
  const user = fixture(); user.lifestyle_data.breakfastTime = '10:00';
  user.archiveBaselineSources = { lifestyle_data__breakfastTime: { responseId: 'r', value: '08:00' } };
  assert.throws(() => buildConfirmation(user, [{ path, value: '09:00' }], actor), { statusCode: 409 });
  user.lifestyle_data.breakfastTime = '08:00';
  user.archiveVersionHistory = [{ path, to: '11:00', confirmedBy: 'a' }];
  assert.throws(() => buildConfirmation(user, [{ path, value: '09:00' }], actor), { statusCode: 409 });
});
test('nutritionist initial assessment cannot be replaced by manager or reassigned on equal reconfirmation', () => {
  const user = fixture(); user.lifestyle_data.breakfastTime = '08:00';
  user.archiveBaselineSources = { lifestyle_data__breakfastTime: { responseId: 'r', value: '08:00', reviewedBy: 'n', reviewedRole: 'nutritionist' } };
  assert.throws(() => buildConfirmation(user, [{ path, value: '09:00' }], { _id: 'm', role: 'healthManager' }), { statusCode: 409 });
  const equal = buildConfirmation(user, [{ path, value: '08:00' }], { _id: 'm', role: 'healthManager' });
  assert.equal(equal.update.$set.archiveBaselineSources, undefined);
  const revised = buildConfirmation(user, [{ path, value: '09:00' }], { _id: 'n', role: 'nutritionist' });
  assert.equal(revised.update.$set[path], '09:00'); assert.equal(revised.changeCount, 0);
  delete user.archiveBaselineSources.lifestyle_data__breakfastTime.reviewedRole;
  assert.throws(() => buildConfirmation(user, [{ path, value: '09:00' }], { _id: 'm', role: 'healthManager' }, new Date(), { n: 'nutritionist' }), { statusCode: 409 });
});
