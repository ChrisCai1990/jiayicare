const test = require('node:test');
const assert = require('node:assert/strict');
const { isIntake } = require('../src/utils/initialArchiveReview');

test('adult health intake is eligible for first questionnaire rewards', () => {
  assert.equal(isIntake({ title: '健康问卷表（成人）', questions: [] }), true);
});

test('sleep backfill is not an intake questionnaire', () => {
  assert.equal(isIntake({ title: '睡眠补填问卷', questions: [
    { archiveField: 'healthProfile.sleep' },
  ] }), false);
});
