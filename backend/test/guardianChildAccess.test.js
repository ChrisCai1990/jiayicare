const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { guardianChild } = require('../src/utils/guardianChildAccess');
const { validateChildAnswers } = require('../src/utils/childQuestionnaireAnswers');
const { buildChildQuestionnaireTemplate } = require('../src/utils/childQuestionnaireTemplate');
const { applicableChildQuestions } = require('../src/utils/childAgeStage');

const guardianId = new mongoose.Types.ObjectId();
const childId = new mongoose.Types.ObjectId();
const tenantId = new mongoose.Types.ObjectId();
const guardian = { _id: guardianId, tenantId };

test('普通家庭关系不能授予儿童档案权限，监护关系仍须同机构且有效', async () => {
  const models = {
    ChildGuardianLink: { findOne: () => ({ lean: async () => null }) },
    User: { findOne: () => ({ lean: async () => ({ _id: childId, patientCategory: 'child' }) }) },
  };
  assert.equal(await guardianChild(guardian, String(childId), models), null);
  models.ChildGuardianLink.findOne = () => ({ lean: async () => ({ child: childId, guardian: guardianId, status: 'active' }) });
  models.User.findOne = query => ({ lean: async () => query.tenantId === tenantId
    ? { _id: childId, patientCategory: 'child', birthDate: '2020-01-01' } : null });
  assert.ok(await guardianChild(guardian, String(childId), models));
  assert.equal(await guardianChild(guardian, String(childId), { ...models,
    User: { findOne: () => ({ lean: async () => ({ _id: childId, patientCategory: 'child', birthDate: '2000-01-01' }) }) },
  }), null);
  assert.equal(await guardianChild({ ...guardian, tenantId: new mongoose.Types.ObjectId() }, String(childId), {
    ...models, User: { findOne: () => ({ lean: async () => null }) },
  }), null);
});

test('复访问卷不重复询问出生史，但保留当下成长信息', () => {
  const questions = buildChildQuestionnaireTemplate().questions;
  const first = applicableChildQuestions(questions, 'school', '男');
  const followup = applicableChildQuestions(questions, 'school', '男', true);
  assert.ok(first.some(item => item.archiveField === 'childProfile.birthWeight'));
  assert.ok(!followup.some(item => item.archiveField === 'childProfile.birthWeight'));
  assert.ok(followup.some(item => item.archiveField === 'childProfile.reportedWeightKg'));
});

test('儿童问卷拒绝空提交、错误数字和未来测量日期', () => {
  const questions = buildChildQuestionnaireTemplate().questions;
  const check = answers => validateChildAnswers(questions, answers, '2021-05-01', new Date('2026-10-03T04:00:00Z'));
  assert.match(check({}), /至少填写一项/);
  assert.match(check({ child_birthWeight: '3.2kg' }), /填写数字/);
  assert.match(check({ child_apgar1min: 11 }), /0到10/);
  assert.match(check({ child_reportedMeasuredAt: '2026-10-04' }), /晚于今天/);
  assert.equal(check({ child_reportedWeightKg: 19.2 }), '');
});
