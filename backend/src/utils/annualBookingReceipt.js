function receipt(input, staffId, task) {
  if (input?.entries !== undefined) return arrangements(input, staffId, task);
  if (require('../../../shared/annualBookingPlan.cjs').bookingSlots(task || {}).length > 1) throw Object.assign(new Error('请逐项填写全部预约安排'), { statusCode: 400 });
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
function arrangements(input, staffId, task) {
  const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  const { bookingSlots, bookingPlan } = require('../../../shared/annualBookingPlan.cjs');
  const slots = bookingSlots(task);
  if (!Array.isArray(input.entries) || input.entries.length !== slots.length || slots.length > 50) fail('请逐项填写全部预约安排');
  const entries = slots.map(slot => {
    const matches = input.entries.filter(e => e && e.id === slot.id);
    if (matches.length !== 1) fail('预约项目重复或遗漏，请刷新核对');
    const e = matches[0];
    if (!['prebook', 'onsite', 'not_required'].includes(e.mode)) fail('请选择预约办理方式');
    for (const key of ['department', 'expert', 'title', 'type']) if (e[key] !== undefined && e[key] !== slot[key]) fail('不能修改顾问的预约要求');
    if (slot.hospital && e.hospital !== undefined && e.hospital !== slot.hospital) fail('不能修改顾问指定医院');
    const note = e.note || '';
    if (typeof note !== 'string' || note.length > 2000) fail('预约说明不能超过2000字');
    if (e.mode === 'prebook') {
      const saved = receipt({ date: e.date, time: e.time, hospital: slot.hospital || e.hospital, note }, staffId, { plannedContent: `医院：${slot.hospital || ''}\n科室：${slot.department}\n专家：${slot.expert}` });
      return { ...slot, mode: e.mode, status: 'booked', date: saved.date, time: saved.time, hospital: saved.hospital, note, confirmedBy: staffId, confirmedAt: saved.confirmedAt };
    }
    if (!note.trim()) fail(e.mode === 'onsite' ? '请说明现场预约前置条件及交接要求' : '请填写无需预约的确认依据');
    if (e.mode === 'onsite' && slot.type !== 'exam') fail('门诊预约须先落实；现场办理仅用于检查预约');
    if (e.mode === 'onsite' && !slot.department) fail('现场预约也需要顾问先明确检查科室');
    return { ...slot, mode: e.mode, status: e.mode === 'onsite' ? 'pending' : 'not_required', note: note.trim(), confirmedBy: staffId, confirmedAt: new Date() };
  });
  return { status: 'arranged', version: 2, entries, advisorPlanText: bookingPlan(task).text, confirmedBy: staffId, confirmedAt: new Date() };
}
module.exports = { receipt, arrangements };
