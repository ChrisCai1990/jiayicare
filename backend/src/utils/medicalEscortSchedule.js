// Escort time is a free-text itinerary, not necessarily a single clock time.
function medicalEscortSchedule(date, itinerary) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400, statusCode: 400 }); };
  const day = String(date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail('请选择有效的主服务日期');
  const calendar = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day) fail('请选择有效的主服务日期');
  const text = String(itinerary || '').trim();
  if (!text) fail('请填写具体时间安排');
  const clock = text.match(/^(\d{1,2})[:：]\s*(\d{2})$/);
  let time = '00:00'; // Date-only task for prose/ranges; do not invent an appointment time.
  if (clock) {
    if (Number(clock[1]) > 23 || Number(clock[2]) > 59) fail('具体时间无效，请使用00:00至23:59，或填写完整安排说明');
    time = `${clock[1].padStart(2, '0')}:${clock[2]}`;
  }
  return new Date(`${day}T${time}:00+08:00`);
}
module.exports = { medicalEscortSchedule };
