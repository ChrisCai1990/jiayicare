const test = require('node:test');
const assert = require('node:assert/strict');
const MedicalExpert = require('../src/models/MedicalExpert');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const { resolveAnnualPlanExperts } = require('../src/utils/annualPlanExperts');
const { buildAnnualPlanFollowUps } = require('../src/utils/annualPlanFollowUps');

test('年度复查多选同院同科专家，并将候选名单和代约要求交给健管随访', async t => {
  const expertIds = ['000000000000000000000011', '000000000000000000000012'];
  t.mock.method(MedicalExpert, 'find', () => ({ populate() { return this; }, lean: async () => expertIds.map((id, index) => ({
    _id: id, name: `专家${index + 1}`, title: '主任医师', status: 'active',
    institutionId: { name: '浙江大学医学院附属邵逸夫医院', aliases: ['邵逸夫医院'] },
    departmentId: { name: '超声医学科', campus: '庆春院区' },
  })) }));
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ assignedHealthManager: '000000000000000000000021' }) }) }));
  t.mock.method(Admin, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  const moduleData = { abnormal_followup: { records: [{
    items: '甲状腺超声', hospital: '邵逸夫医院', department: '超声科', time: '2026-12-01',
    expertIds, bookingRequired: true,
  }] } };
  await resolveAnnualPlanExperts(moduleData);
  const rows = await buildAnnualPlanFollowUps({ _id: '000000000000000000000031', patientId: '000000000000000000000032', moduleData });
  assert.equal(moduleData.abnormal_followup.records[0].expertSnapshots.length, 2);
  assert.equal(rows.length, 1);
  assert.equal(String(rows[0].assignedTo), '000000000000000000000021');
  assert.match(rows[0].content, /专家1、专家2/);
  assert.match(rows[0].content, /健管专员联系医院/);
  assert.equal(rows[0].formData.bookingRequest.experts.length, 2);
});

test('专家与方案医院不一致时拒绝保存', async t => {
  t.mock.method(MedicalExpert, 'find', () => ({ populate() { return this; }, lean: async () => [{
    _id: '000000000000000000000011', name: '专家1', institutionId: { name: '其他医院' }, departmentId: { name: '超声科' },
  }] }));
  await assert.rejects(resolveAnnualPlanExperts({ abnormal_followup: { records: [{ hospital: '邵逸夫医院', department: '超声科', expertIds: ['000000000000000000000011'] }] } }), /不匹配/);
});
