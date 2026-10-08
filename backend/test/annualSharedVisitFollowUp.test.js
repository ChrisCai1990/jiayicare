const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const { buildAnnualPlanFollowUps } = require('../src/utils/annualPlanFollowUps');
const { buildAnnualPlanServiceTasks } = require('../src/utils/annualPlanServiceTasks');

test('同次就诊只生成一条健管随访和一条服务需求，附带全部事项', async t => {
  const manager = '000000000000000000000001';
  const planner = '000000000000000000000002';
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ assignedHealthManager: manager }) }) }));
  t.mock.method(Admin, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  const plan = { _id: '000000000000000000000003', patientId: '000000000000000000000004', confirmedAt: new Date(), moduleData: {
    medical_treatment: { records: [{ reason: '肠道评估', visit_time: '2026-12-04', hospital: '浙二医院', department: '消化内科', serviceMode: 'managed', managedServiceType: 'outpatient', visitGroupId: '12月就诊' }] },
    abnormal_followup: { records: [{ items: '病理复查', reason: '核实报告', time: '2026-12-04', hospital: '浙江大学医学院附属第二医院', serviceMode: 'shared', visitGroupId: '12月就诊' }] },
  } };
  const followUps = await buildAnnualPlanFollowUps(plan);
  const services = buildAnnualPlanServiceTasks(plan, { assignedHealthPlanner: planner });
  assert.equal(followUps.length, 1);
  assert.equal(followUps[0].deliveryMode, 'managed');
  assert.match(followUps[0].content, /病理复查/);
  assert.equal(services.length, 1);
  assert.equal(services[0].formData.serviceRequest.itemSnapshot.visitItems.length, 2);
});
