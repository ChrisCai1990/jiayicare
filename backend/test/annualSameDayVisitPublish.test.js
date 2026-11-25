const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../src/utils/annualPlanPublishValidation');
const { sharedVisitItems } = require('../src/utils/annualVisitGroups');

test('同院同日的就医和完善检查发布前须合并或说明分开原因', () => {
  const medical = { items: '心内科就医', visit_time: '2026-11-27', hospital: '邵逸夫医院', serviceMode: 'single', serviceType: 'proxy_booking' };
  const exam = { items: '脂蛋白磷脂酶A2', time: '2026-11-27', hospital: '邵逸夫医院', serviceMode: 'single', serviceType: 'escort_exam' };
  const data = { medical_treatment: { records: [medical] }, checkup_completion: { records: [exam] } };
  assert.match(validate(data, '2026-11-25'), /归为同次就诊/);
  assert.equal(validate({ ...data, checkup_completion: { records: [{ ...exam, scheduleSeparationReason: '检查须先另行安排' }] } }, '2026-11-25'), '');
  assert.equal(validate({ medical_treatment: { records: [{ ...medical, visitGroupId: '同次' }] }, checkup_completion: { records: [{ ...exam, serviceMode: 'shared', serviceType: '', visitGroupId: '同次' }] } }, '2026-11-25'), '');
});

test('随同检查保留主就医开单专家与独立检查科室', () => {
  const data = {
    medical_treatment: { records: [{ visitGroupId: '同次', items: '心内科就医', department: '心内科', expertSnapshots: [{ name: '专家甲' }] }] },
    checkup_completion: { records: [{ visitGroupId: '同次', items: '脂蛋白磷脂酶A2', order_dept: '心内科', orderExpertSnapshots: [{ name: '专家甲' }], department: '检验科' }] },
  };
  const items = sharedVisitItems(data, '同次');
  assert.equal(items[0].expert, '专家甲');
  assert.equal(items[1].orderDepartment, '心内科');
  assert.equal(items[1].orderExpert, '专家甲');
  assert.equal(items[1].examDepartment, '检验科');
});
