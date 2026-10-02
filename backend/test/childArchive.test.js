const test = require('node:test');
const assert = require('node:assert/strict');
const { initialChildMutation, followupChildMutation, childSubmission, reviewChildSubmission, manualChildUpdate } = require('../src/utils/childArchive');

const questionnaire = { _id: 'questionnaire-1', title: '儿童健康问卷', questions: [
  { id: 'birth', text: '出生体重', archiveField: 'childProfile.birthWeight' },
  { id: 'feeding', text: '喂养情况', archiveField: 'childProfile.feeding' },
] };
const response = { _id: 'response-1', submittedAt: new Date('2026-10-03T00:00:00Z'), answers: { birth: 3200, feeding: '母乳' } };
const actor = { _id: 'staff-1', name: '专员' };

test('首次儿童问卷仅预填空字段，已有人工记录进入核实', () => {
  const user = { _id: 'child-1', patientCategory: 'child', childProfile: { feeding: '混合喂养' } };
  const mutation = initialChildMutation(user, questionnaire, response);
  assert.equal(mutation.update.$set['childProfile.birthWeight'], 3200);
  assert.equal(mutation.update.$set['childProfile.feeding'], undefined);
  assert.equal(mutation.submission.items.find(item => item.path === 'childProfile.feeding').conflict, true);
  assert.equal(mutation.submission.items.find(item => item.path === 'childProfile.feeding').before, '混合喂养');
});

test('首次核实可修正预填值、保留原值，并留下来源变化', () => {
  const first = initialChildMutation({ _id: 'child-1', patientCategory: 'child', childProfile: { feeding: '混合喂养' } }, questionnaire, response).submission;
  const user = { _id: 'child-1', patientCategory: 'child', childProfile: { birthWeight: 3200, feeding: '混合喂养' }, childArchiveSubmissions: [first] };
  const mutation = reviewChildSubmission(user, response._id, { revision: 0, note: '已核对出生记录及监护人说明', decisions: [
    { path: 'childProfile.birthWeight', verified: true, accept: true, value: '3150' },
    { path: 'childProfile.feeding', verified: true, accept: false, value: '母乳' },
  ] }, actor);
  assert.equal(mutation.update.$set['childProfile.birthWeight'], 3150);
  assert.equal(mutation.update.$set['childProfile.feeding'], undefined);
  assert.equal(mutation.update.$set['childArchiveSubmissions.0'].status, 'reviewed');
  assert.equal(mutation.update.$push.childArchiveHistory.changes[0].sourceResponseId, response._id);
});

test('后续相同回答无需复核；有变化时只确认变化并拒绝过期资料', () => {
  const user = { _id: 'child-1', patientCategory: 'child', childProfile: { birthWeight: 3200, feeding: '母乳' } };
  const same = childSubmission(user, questionnaire, response, 'followup');
  assert.equal(same.status, 'unchanged');
  const changedResponse = { ...response, _id: 'response-2', answers: { birth: 3200, feeding: '混合喂养' } };
  const changed = childSubmission(user, questionnaire, changedResponse, 'followup');
  assert.equal(changed.items.length, 1);
  assert.equal(changed.items[0].path, 'childProfile.feeding');
  assert.throws(() => reviewChildSubmission({ ...user, childProfile: { ...user.childProfile, feeding: '配方奶' }, childArchiveSubmissions: [changed] }, changedResponse._id,
    { revision: 0, note: '已核实', decisions: [{ path: 'childProfile.feeding', verified: true, accept: true, value: '混合喂养' }] }, actor), /已变化/);
});

test('后续问卷自动预填空字段，但不覆盖已有字段', () => {
  const user = { _id: 'child-1', patientCategory: 'child', childArchiveFirstResponseId: 'first', childProfile: { feeding: '母乳' } };
  const next = { ...response, _id: 'response-3', answers: { birth: 3200, feeding: '混合喂养' } };
  const mutation = followupChildMutation(user, questionnaire, next);
  assert.equal(mutation.update.$set['childProfile.birthWeight'], 3200);
  assert.equal(mutation.update.$set['childProfile.feeding'], undefined);
  assert.equal(mutation.submission.items.find(item => item.path === 'childProfile.birthWeight').imported, true);
  assert.equal(mutation.submission.items.find(item => item.path === 'childProfile.feeding').imported, false);
  assert.equal(mutation.filter['childProfile.birthWeight'], null);
});

test('人工更新要求依据及当前值，不能绕过待核实的首次问卷', () => {
  const user = { _id: 'child-1', patientCategory: 'child', childProfile: { feeding: '母乳' }, childArchiveSubmissions: [] };
  const mutation = manualChildUpdate(user, { path: 'childProfile.feeding', expected: '母乳', value: '混合喂养', reason: '监护人复述并核对' }, actor);
  assert.equal(mutation.update.$set['childProfile.feeding'], '混合喂养');
  assert.throws(() => manualChildUpdate({ ...user, childArchiveSubmissions: [{ kind: 'initial', status: 'pending' }] },
    { path: 'childProfile.feeding', expected: '母乳', value: '混合喂养', reason: '核实' }, actor), /首次儿童问卷/);
  assert.throws(() => manualChildUpdate({ ...user, childArchiveSubmissions: [{ kind: 'followup', status: 'pending', items: [{ path: 'childProfile.feeding' }] }] },
    { path: 'childProfile.feeding', expected: '母乳', value: '混合喂养', reason: '核实' }, actor), /待核实的儿童问卷/);
});
