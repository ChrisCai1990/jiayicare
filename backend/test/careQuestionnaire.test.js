const test = require('node:test'), assert = require('node:assert/strict');
const { TARGETS, questions, additions } = require('../src/utils/careQuestionnaire');
const { buildArchiveDraft } = require('../src/utils/archiveImport');
const { buildConfirmation } = require('../src/utils/archiveConfirmation');
test('only two basic questionnaires, optional unscored additions are idempotent', () => {
  for (const [_id, title] of Object.entries(TARGETS)) {
    assert.equal(additions({ _id, title, questions: [] }).length, 4);
    assert.equal(additions({ _id, title, questions }).length, 0);
    assert.ok(questions.every(q => !q.required && !q.scoreEnabled));
  }
  assert.throws(() => additions({ _id: 'other', title: '膳食调查' }));
});
test('answers become reviewed initial profile; replay cannot overwrite staff revision', () => {
  const template = { _id: 'template', questions };
  const user = { _id: 'user' };
  user.archiveDraft = buildArchiveDraft(user, template, { _id: 'response', answers: { care_preferred_city: '杭州', care_allow_travel: '不接受' } });
  const result = buildConfirmation(user, user.archiveDraft.items, { _id: 'staff' });
  assert.equal(result.update.$set['carePreferences.city'], '杭州');
  assert.equal(result.update.$set['carePreferences.allowTravel'], 'no');
  user.archiveBaselineSources = result.update.$set.archiveBaselineSources;
  user.carePreferences = { city: '上海', allowTravel: 'no' };
  assert.throws(() => buildConfirmation(user, user.archiveDraft.items, { _id: 'staff' }), /后续更新/);
  assert.equal(buildArchiveDraft({}, template, { answers: {} }).items.length, 0);
});
