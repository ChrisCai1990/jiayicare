function receipt(input, staffId) {
  const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  const { date, hospital, department, note = '' } = input || {};
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail('请填写实际预约日期');
  for (const value of [hospital, department]) if (typeof value !== 'string' || !value.trim() || value.length > 200) fail('请填写预约医院及科室（不超过200字）');
  if (typeof note !== 'string' || note.length > 2000) fail('预约备注不能超过2000字');
  return { status: 'booked', date, hospital: hospital.trim(), department: department.trim(), note: note.trim(), confirmedBy: staffId, confirmedAt: new Date() };
}
module.exports = { receipt };
