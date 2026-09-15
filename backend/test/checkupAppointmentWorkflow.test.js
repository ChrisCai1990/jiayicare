const test = require('node:test');
const assert = require('node:assert/strict');
const { isCheckupAppointmentOrder, plannerValidation, bookingValidation } = require('../src/utils/checkupAppointmentWorkflow');

const intake = { serviceType: 'special', preferredDateStart: '2026-10-01', preferredDateEnd: '2026-10-03', checkItems: [{ name: '甲状腺超声' }], institution: '嘉医汇合作医院', expert: '王医生', fastingRequired: true };

test('待约检服务可由工作流键或名称识别', () => {
  assert.equal(isCheckupAppointmentOrder({ serviceWorkflowSnapshot: { key: 'checkup_appointment' } }), true);
  assert.equal(isCheckupAppointmentOrder('特殊约检服务'), true);
  assert.equal(isCheckupAppointmentOrder({ serviceName: '医务代办服务', specificationLabel: '代约检（常规）' }), true);
  assert.equal(isCheckupAppointmentOrder({ serviceName: '医务代办服务', specificationLabel: '复查督办服务' }), false);
  assert.equal(isCheckupAppointmentOrder('门诊一站式服务'), false);
});

test('特殊约检在规划师阶段必须确认专家与检查信息', () => {
  assert.equal(plannerValidation(intake), '');
  assert.match(plannerValidation({ ...intake, expert: '' }), /检查专家/);
  assert.match(plannerValidation({ ...intake, preferredDateEnd: '2026-09-30' }), /结束日期/);
});

test('健管专员必须完成开单号和检查日专家号', () => {
  const booking = { orderFormAppointment: { institution: '医院', department: '内科', doctor: '李医生', date: '2026-10-01', time: '09:00' }, expertAppointment: { institution: '医院', department: '超声科', doctor: '王医生', date: '2026-10-02', time: '10:00' } };
  assert.equal(bookingValidation(booking), '');
  assert.match(bookingValidation({ ...booking, expertAppointment: { ...booking.expertAppointment, time: '' } }), /完整填写/);
});
