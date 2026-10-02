const test = require('node:test');
const assert = require('node:assert/strict');
const { childAgeStage, applicableChildQuestions } = require('../src/utils/childAgeStage');
const { createChildStandardRecord } = require('../src/utils/childStandardRecord');

test('年龄段按中国日期和实际生日切换，旧记录不会跟着当前年龄变化', () => {
  assert.equal(childAgeStage('2026-09-06', new Date('2026-10-03T00:00:00Z')).id, 'newborn');
  assert.equal(childAgeStage('2026-09-05', new Date('2026-10-03T00:00:00Z')).id, 'infant');
  assert.equal(childAgeStage('2025-10-03', new Date('2026-10-02T15:59:59Z')).id, 'infant');
  assert.equal(childAgeStage('2025-10-03', new Date('2026-10-02T16:00:00Z')).id, 'toddler');
  assert.equal(childAgeStage('2008-10-03', new Date('2026-10-02T16:00:00Z')), null);
  assert.equal(childAgeStage('2026-02-30'), null);
});

test('分龄题目保留公共题，屏蔽不适用年龄段及性别题', () => {
  const questions = [{ id: 'all' }, { id: 'young', ageStages: ['infant'] }, { id: 'school', ageStages: ['school'] }, { id: 'female', genderOnly: '女' }];
  assert.deepEqual(applicableChildQuestions(questions, 'school', '男').map(q => q.id), ['all', 'school']);
});

test('分龄记录按实际访视年龄和表单节点校验，并保存来源快照', () => {
  const user = { _id: 'child', patientCategory: 'child', birthDate: '2023-10-03' };
  const actor = { _id: 'staff', name: '医护' };
  const now = new Date('2026-10-03T04:00:00Z');
  const mutation = createChildStandardRecord(user, { formId: 'preschool_3_6', schedule: '3岁', visitDate: '2026-10-03', sourceType: '本机构检查', note: '本次体检记录', values: { weight: '14.2', assessment: '已评估' } }, actor, now);
  assert.equal(mutation.record.values.weight, 14.2);
  assert.equal(mutation.record.ageStage.id, 'preschool');
  assert.equal(mutation.record.standard, '国家基本公共卫生服务规范（第三版）');
  assert.throws(() => createChildStandardRecord(user, { formId: 'infant_1_8', schedule: '3月龄', visitDate: '2026-10-03', sourceType: '本机构检查', note: '记录', values: { weight: 14 } }, actor, now), /年龄不符/);
  assert.throws(() => createChildStandardRecord(user, { formId: 'preschool_3_6', schedule: '3岁', visitDate: '2026-10-03', sourceType: '本机构检查', note: '记录', values: { unknown: 'x' } }, actor, now), /无效/);
  assert.throws(() => createChildStandardRecord(user, { formId: 'preschool_3_6', schedule: '3岁', visitDate: '2026-10-03', sourceType: '本机构检查', note: '记录', values: { weightHeightAssessment: '严重异常' } }, actor, now), /选项无效/);
  const original = mutation.record;
  const revised = createChildStandardRecord({ ...user, childStandardRecords: [original] }, { formId: 'preschool_3_6', schedule: '3岁', visitDate: '2026-10-03', sourceType: '本机构检查', note: '复核原始体检单', values: { weight: '14.5' }, supersedesId: String(original._id) }, actor, now).record;
  assert.equal(String(revised.supersedesId), String(original._id));
  assert.throws(() => createChildStandardRecord({ ...user, childStandardRecords: [original, revised] }, { formId: 'preschool_3_6', schedule: '3岁', visitDate: '2026-10-03', sourceType: '本机构检查', note: '再次修订', values: { weight: 14.6 }, supersedesId: String(original._id) }, actor, now), /已有新版本/);
});

test('6岁节点可用3～6岁规范表，也可记录实际在校年度体检', () => {
  const user = { _id: 'child', patientCategory: 'child', birthDate: '2020-10-03' };
  const actor = { _id: 'staff', name: '医护' };
  const now = new Date('2026-10-03T04:00:00Z');
  const preschool = createChildStandardRecord(user, { formId: 'preschool_3_6', schedule: '6岁', visitDate: '2026-10-03', sourceType: '本机构检查', note: '六岁访视', values: { height: 115 } }, actor, now);
  const school = createChildStandardRecord(user, { formId: 'student_annual', schedule: '年度体检', visitDate: '2026-10-03', sourceType: '外部报告转录', note: '依据学校年度体检报告', values: { height: 115 } }, actor, now);
  assert.equal(preschool.record.formId, 'preschool_3_6');
  assert.equal(school.record.formId, 'student_annual');
});
