const test = require('node:test');
const assert = require('node:assert/strict');
const { isCheckupAppointmentOrder, plannerValidation, bookingValidation, validate } = require('../src/utils/checkupAppointmentWorkflow');

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
  assert.equal(plannerValidation({ ...intake, preferredDateStart: '', preferredDateEnd: '' }), '');
  assert.match(plannerValidation({ ...intake, preferredDateStart: '', preferredDateEnd: '2026-10-03' }), /补全/);
});

test('健管专员必须完成三个号，并让特殊检查先于最终专家看诊', () => {
  const booking = { intake, orderFormAppointment: { campus: '庆春院区', department: '全科', doctor: '李医生', date: '2026-10-01', time: '09:00' }, specialCheckAppointment: { checkItem: '甲状腺超声', campus: '庆春院区', department: '超声科', doctor: '王医生', date: '2026-10-02', time: '09:00' }, postCheckExpertAppointment: { campus: '庆春院区', department: '甲乳科', doctor: '赵医生', date: '2026-10-02', time: '10:00' } };
  assert.equal(bookingValidation(booking), '');
  assert.match(bookingValidation({ ...booking, postCheckExpertAppointment: { ...booking.postCheckExpertAppointment, time: '' } }), /完整填写/);
  assert.match(bookingValidation({ ...booking, postCheckExpertAppointment: { ...booking.postCheckExpertAppointment, time: '09:00' } }), /之前/);
});

test('常规约检只需开检查单号和检查后专家看诊号', () => {
  const booking = { intake: { ...intake, serviceType: 'normal', expert: '' }, orderFormAppointment: { campus: '庆春院区', department: '全科', doctor: '李医生', date: '2026-10-01', time: '09:00' }, postCheckExpertAppointment: { campus: '庆春院区', department: '内科', doctor: '赵医生', date: '2026-10-02', time: '10:00' } };
  assert.equal(bookingValidation(booking), '');
  assert.match(bookingValidation({ ...booking, postCheckExpertAppointment: { ...booking.postCheckExpertAppointment, date: '2026-09-30' } }), /不能早于/);
});

test('健康规划师监督任务只能随流程自动结案', async () => {
  const error = await validate({ workflowKey: 'checkup_appointment:supervise' }, { status: 'completed' }, { role: 'healthPlanner' });
  assert.match(error, /自动结案/);
});
