const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { ensureChildQuestionnairePush, automaticPushId } = require('../src/utils/childQuestionnaireAutoPush');

const id = () => new mongoose.Types.ObjectId();
const query = value => ({ select: () => ({ lean: async () => value }) });

function scenario(overrides = {}) {
  const user = { _id: id(), tenantId: id(), patientCategory: 'child', onboardingCompleted: true,
    birthDate: '2019-01-01', assignedHealthPlanner: id(), ...overrides };
  const questionnaire = { _id: id(), title: '儿童健康问卷' };
  const pushRows = [];
  const answerRows = [];
  let targetUpdates = 0;
  const models = {
    DynamicQuestionnaire: {
      findOne: () => query(questionnaire),
      updateOne: async () => { targetUpdates++; },
    },
    QuestionnaireResponse: { find: () => query(answerRows) },
    PushRecord: {
      find: () => query(pushRows),
      updateOne: async (filter) => {
        if (pushRows.some(row => String(row._id) === String(filter._id))) return { upsertedCount: 0 };
        pushRows.push({ _id: filter._id });
        return { upsertedCount: 1 };
      },
    },
    Admin: { findOne: () => query({ _id: user.assignedHealthPlanner }) },
  };
  return { user, questionnaire, pushRows, answerRows, models, get targetUpdates() { return targetUpdates; } };
}

test('child login pushes once per age stage and repeat login does not duplicate', async () => {
  const state = scenario();
  assert.equal(await ensureChildQuestionnairePush(state.user, state.models), 'pushed');
  assert.equal(await ensureChildQuestionnairePush(state.user, state.models), 'already_pending');
  assert.equal(state.pushRows.length, 1);
  assert.equal(state.targetUpdates, 1);
  assert.equal(String(state.pushRows[0]._id), String(automaticPushId(state.user._id, 'school')));
});

test('same-stage answer or manual pending push prevents automatic repeat', async () => {
  const answered = scenario();
  answered.answerRows.push({ questionnaireSnapshot: { ageStage: { id: 'school' } } });
  assert.equal(await ensureChildQuestionnairePush(answered.user, answered.models), 'answered_stage');
  assert.equal(answered.pushRows.length, 0);

  const manual = scenario();
  manual.pushRows.push({ _id: id() });
  assert.equal(await ensureChildQuestionnairePush(manual.user, manual.models), 'already_pending');
  assert.equal(manual.pushRows.length, 1);
});

test('prior stage answer permits next age-stage questionnaire', async () => {
  const state = scenario();
  const oldPush = { _id: id() };
  state.pushRows.push(oldPush);
  state.answerRows.push({ pushRecordId: oldPush._id, questionnaireSnapshot: { ageStage: { id: 'preschool' } } });
  assert.equal(await ensureChildQuestionnairePush(state.user, state.models), 'pushed');
  assert.equal(state.pushRows.length, 2);
});

test('adult, unfinished onboarding and invalid child birth date do not push', async () => {
  for (const overrides of [
    { patientCategory: 'adult' }, { onboardingCompleted: false }, { birthDate: '' },
    { childArchiveImportPending: { responseId: id() } },
  ]) {
    const state = scenario(overrides);
    await ensureChildQuestionnairePush(state.user, state.models);
    assert.equal(state.pushRows.length, 0);
  }
});
