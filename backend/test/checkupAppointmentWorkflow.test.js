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
  const booking = { intake, orderFormAppointment: { campus: '庆春院区', department: '全科', location: '3号楼 1层 A区', doctor: '李医生', date: '2026-10-01', time: '09:00' }, specialCheckAppointment: { checkItem: '甲状腺超声', campus: '庆春院区', department: '超声科', location: '3号楼 2层 B区', doctor: '王医生', date: '2026-10-02', time: '09:00' }, postCheckExpertAppointment: { campus: '庆春院区', department: '甲乳科', location: '2号楼 4层 A区', doctor: '赵医生', date: '2026-10-02', time: '10:00' } };
  assert.equal(bookingValidation(booking), '');
  assert.match(bookingValidation({ ...booking, specialCheckAppointment: { ...booking.specialCheckAppointment, location: '' } }), /具体地点/);
  assert.match(bookingValidation({ ...booking, postCheckExpertAppointment: { ...booking.postCheckExpertAppointment, time: '' } }), /完整填写/);
  assert.match(bookingValidation({ ...booking, postCheckExpertAppointment: { ...booking.postCheckExpertAppointment, time: '09:00' } }), /之前/);
});

test('常规约检只需开检查单号和检查后专家看诊号', () => {
  const booking = { intake: { ...intake, serviceType: 'normal', expert: '' }, orderFormAppointment: { campus: '庆春院区', department: '全科', location: '3号楼 1层 A区', doctor: '李医生', date: '2026-10-01', time: '09:00' }, postCheckExpertAppointment: { campus: '庆春院区', department: '内科', location: '2号楼 4层 A区', doctor: '赵医生', date: '2026-10-02', time: '10:00' } };
  assert.equal(bookingValidation(booking), '');
  assert.match(bookingValidation({ ...booking, postCheckExpertAppointment: { ...booking.postCheckExpertAppointment, date: '2026-09-30' } }), /不能早于/);
  const withSpecialCheck = { ...booking, specialCheckRequired: true, specialCheckAppointment: { checkItem: '甲状腺超声', campus: '庆春院区', department: '超声科', location: '3号楼 2层', date: '2026-10-02', time: '09:00' } };
  assert.equal(bookingValidation(withSpecialCheck), '');
  assert.match(bookingValidation({ ...withSpecialCheck, specialCheckAppointment: { ...withSpecialCheck.specialCheckAppointment, time: '' } }), /特殊检查预约/);
  assert.match(bookingValidation({ ...withSpecialCheck, postCheckExpertAppointment: { ...booking.postCheckExpertAppointment, time: '09:00' } }), /之前/);
});

test('三环节均可填写多项预约，并逐项校验与检查后门诊的时间顺序', () => {
  const orderFormAppointments = [
    { campus: '庆春', department: '内科', location: '1号楼', doctor: '李医生', date: '2026-10-01', time: '08:00' },
    { campus: '庆春', department: '甲乳科', location: '2号楼', doctor: '王医生', date: '2026-10-01', time: '09:00' },
  ];
  const specialCheckAppointments = [
    { checkItem: '甲状腺超声', campus: '庆春', department: '超声科', location: '3号楼', date: '2026-10-02', time: '09:00' },
    { checkItem: '乳腺超声', campus: '庆春', department: '超声科', location: '3号楼', date: '2026-10-02', time: '10:00' },
  ];
  const postCheckExpertAppointments = [
    { campus: '庆春', department: '甲乳科', location: '2号楼', doctor: '赵医生', date: '2026-10-02', time: '11:00' },
    { campus: '庆春', department: '内科', location: '1号楼', doctor: '钱医生', date: '2026-10-02', time: '12:00' },
  ];
  const booking = { intake: { ...intake, serviceType: 'normal' }, specialCheckRequired: true, orderFormAppointments, specialCheckAppointments, postCheckExpertAppointments };
  assert.equal(bookingValidation(booking), '');
  assert.match(bookingValidation({ ...booking, orderFormAppointments: [...orderFormAppointments, { ...orderFormAppointments[1], doctor: '' }] }), /每项开检查单号/);
  assert.match(bookingValidation({ ...booking, specialCheckAppointments: [...specialCheckAppointments, { ...specialCheckAppointments[1], location: '' }] }), /每项特殊检查预约/);
  assert.match(bookingValidation({ ...booking, postCheckExpertAppointments: [{ ...postCheckExpertAppointments[0], time: '09:00' }, postCheckExpertAppointments[1]] }), /之前/);
});

test('健康规划师监督任务只能随流程自动结案', async () => {
  const error = await validate({ workflowKey: 'checkup_appointment:supervise' }, { status: 'completed' }, { role: 'healthPlanner' });
  assert.match(error, /自动结案/);
});

test('健管专员审核前必须逐项收集检查报告，病历可选', async () => {
  const task = { workflowKey: 'checkup_appointment:manager_review' };
  const base = { status: 'completed', formData: { medical: { checkAppointments: [{ item: '甲状腺超声' }] }, reviewSummary: '资料齐全', followUpContent: '两周后电话随访' } };
  assert.match(await validate(task, base, { role: 'healthManager' }), /逐项上传/);
  assert.match(await validate(task, { ...base, formData: { ...base.formData, reportAssignments: { '甲状腺超声': ['report-1'] } } }, { role: 'healthManager' }), /AI/);
  assert.equal(await validate(task, { ...base, formData: { ...base.formData, reportAssignments: { '甲状腺超声': ['report-1'] }, aiGenerated: true } }, { role: 'healthManager' }), '');
});
