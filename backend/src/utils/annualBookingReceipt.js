function receipt(input, staffId, task) {
  const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  const { date, time, note = '' } = input || {};
  const plan = require('../../../shared/annualBookingPlan.cjs').bookingPlan(task || {});
  const hospital = plan.hospital || input?.hospital;
  const department = plan.department;
  if (!department) fail('顾问计划尚未明确预约科室，请健康顾问补充后再预约');
  for (const key of ['hospital', 'department', 'expert']) if (plan[key] && input?.[key] !== undefined && input[key] !== plan[key]) fail('不能更改健康顾问已确定的医院、科室或专家');
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('请填写具体预约时间');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail('请填写实际预约日期');
  for (const value of [hospital, department]) if (typeof value !== 'string' || !value.trim() || value.length > 200) fail('请填写预约医院及科室（不超过200字）');
  if (typeof note !== 'string' || note.length > 2000) fail('预约备注不能超过2000字');
  return { status: 'booked', date, time, hospital: hospital.trim(), department: department.trim(), expert: plan.expert, note: note.trim(), advisorPlanText: plan.text, confirmedBy: staffId, confirmedAt: new Date() };
}
module.exports = { receipt };
