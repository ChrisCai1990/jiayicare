const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAppointmentContact, knowledgeKindFilter } = require('../src/utils/medicalResourcePaths');

test('problem and contact searches stay on their own knowledge paths', () => {
  assert.deepEqual(knowledgeKindFilter('problem'), { $ne: 'appointment_rule' });
  assert.equal(knowledgeKindFilter('problem', 'expert_recommendation'), 'expert_recommendation');
  assert.equal(knowledgeKindFilter('contact', 'expert_recommendation'), 'appointment_rule');
  assert.equal(knowledgeKindFilter('', 'expert_recommendation'), 'expert_recommendation');
});

test('a contact needs a hospital, a service type and a usable booking route', () => {
  const contact = { kind: 'appointment_rule', institutionId: 'hospital-id', appointmentInfo: { serviceType: 'checkup', hospitalPhone: '0571-12345678' } };
  assert.doesNotThrow(() => validateAppointmentContact(contact));
  assert.throws(() => validateAppointmentContact({ ...contact, institutionId: null }), /必须关联医院/);
  assert.throws(() => validateAppointmentContact({ ...contact, appointmentInfo: { ...contact.appointmentInfo, serviceType: '' } }), /服务类型/);
  assert.throws(() => validateAppointmentContact({ ...contact, appointmentInfo: { serviceType: 'checkup', channels: [] } }), /预约渠道/);
  assert.throws(() => validateAppointmentContact(contact, { forPublication: true }), /核实日期/);
  assert.doesNotThrow(() => validateAppointmentContact({ ...contact, sourceNote: '医院官网，张三核实', expiresAt: new Date('2099-12-31'), appointmentInfo: { ...contact.appointmentInfo, verifiedAt: new Date('2026-11-01') } }, { forPublication: true }));
  assert.doesNotThrow(() => validateAppointmentContact({ kind: 'department_advantage' }));
});
