const test = require('node:test');
const assert = require('node:assert/strict');
const { canCustomerAccess, canStaffAccess, canMentorObserve, needsStaffReply } = require('../src/utils/inAppServiceGroupPolicy');

const group = { patientId: 'patient-a', tenantId: 'tenant-a', status: 'active' };
const patient = { _id: 'patient-a', tenantId: 'tenant-a', assignedHealthManager: 'staff-a' };
const customer = { _id: 'patient-a', tenantId: 'tenant-a' };
const staff = { _id: 'staff-a', tenantId: 'tenant-a', role: 'healthManager', staffStatus: 'active' };
const mentor = { _id: 'mentor-a', tenantId: 'tenant-a', role: 'familyDoctor', staffStatus: 'active' };

test('客户只能进入本人的本机构有效服务群', () => {
  assert.equal(canCustomerAccess(group, customer), true);
  assert.equal(canCustomerAccess(group, { ...customer, _id: 'patient-b' }), false);
  assert.equal(canCustomerAccess(group, { ...customer, tenantId: 'tenant-b' }), false);
  assert.equal(canCustomerAccess({ ...group, status: 'closed' }, customer), false);
});

test('当前服务人员可回复，交接或停用后失去权限', () => {
  assert.equal(canStaffAccess(group, patient, staff), true);
  assert.equal(canStaffAccess(group, { ...patient, assignedHealthManager: 'staff-b' }, staff), false);
  assert.equal(canStaffAccess(group, patient, { ...staff, staffStatus: 'inactive' }), false);
  assert.equal(canStaffAccess(group, patient, { ...staff, tenantId: 'tenant-b' }), false);
});

test('导师只可监管本团队当前服务的同机构客户', () => {
  assert.equal(canMentorObserve(group, patient, mentor, ['staff-a']), true);
  assert.equal(canStaffAccess(group, patient, mentor), false);
  assert.equal(canMentorObserve(group, patient, mentor, ['staff-b']), false);
  assert.equal(canMentorObserve(group, { ...patient, isDeleted: true }, mentor, ['staff-a']), false);
  assert.equal(canMentorObserve(group, patient, { ...mentor, tenantId: 'tenant-b' }, ['staff-a']), false);
});

test('客户注销清理覆盖群、消息和监管访问记录', () => {
  const { RULES } = require('../src/utils/accountDeletionPersonalData');
  for (const name of ['InAppServiceGroup', 'InAppServiceGroupMessage', 'InAppServiceGroupView']) {
    assert.ok(RULES.some(rule => rule.name === name && rule.path === 'patientId'), name);
  }
});

test('客户最后发言尚未被团队回复时标记待回复', () => {
  const customerAt = new Date('2026-11-13T08:00:00Z');
  const earlierStaffAt = new Date('2026-11-13T07:59:00Z');
  const laterStaffAt = new Date('2026-11-13T08:01:00Z');
  assert.equal(needsStaffReply({ lastCustomerMessageAt: customerAt }), true);
  assert.equal(needsStaffReply({ lastCustomerMessageAt: customerAt, lastStaffMessageAt: earlierStaffAt }), true);
  assert.equal(needsStaffReply({ lastCustomerMessageAt: customerAt, lastStaffMessageAt: laterStaffAt }), false);
});
