// Calendar dates only: no timezone-dependent parsing or 30-day "months".
function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function addMonths(day, months) {
  if (!validDay(day) || !Number.isInteger(months) || months < 0 || months > 120) return '';
  const d = new Date(day), date = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(date, last)); return d.toISOString().slice(0, 10);
}
function appointmentDay(day) {
  return validDay(day) ? new Date(Date.parse(day) - 7 * 86400000).toISOString().slice(0, 10) : '';
}
function evaluatedTiming(row, dateKey) {
  if (row[dateKey] && row[dateKey] !== '待确认' && !validDay(row[dateKey])) throw Object.assign(new Error('AI建议日期无效，请重新评估，不替换现有方案'), { statusCode: 409 });
  const day = validDay(row[dateKey]) ? row[dateKey] : addMonths(row.timingBaseDate, row.timingIntervalMonths);
  return day ? { ...row, [dateKey]: day, appointmentSchedulingVersion: 1 } : row;
}
module.exports = { validDay, addMonths, appointmentDay, evaluatedTiming };
