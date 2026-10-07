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
function explicitSuggestedDay(row, minDate = '') {
  const text = [row.dateSelectionReason, row.timingReason, row.notes].filter(Boolean).join('；');
  const dates = [...text.matchAll(/\d{4}-\d{2}-\d{2}/g)].filter(match => {
    const before = text.slice(Math.max(0, match.index - 22), match.index);
    const after = text.slice(match.index + 10, match.index + 22);
    return /建议|最迟|不晚于|应于|安排|复评时间|计划|截止/.test(before) || /前完成|前就医|前复查/.test(after);
  }).map(match => match[0]).filter(day => validDay(day) && (!minDate || day >= minDate));
  return dates.sort()[0] || '';
}
function evaluatedTiming(row, dateKey, minDate = '') {
  if (row[dateKey] && row[dateKey] !== '待确认' && !validDay(row[dateKey])) throw Object.assign(new Error('AI建议日期无效，请重新评估，不替换现有方案'), { statusCode: 409 });
  const intervalDay = addMonths(row.timingBaseDate, row.timingIntervalMonths);
  const day = validDay(row[dateKey]) ? row[dateKey]
    : explicitSuggestedDay(row, minDate) || (intervalDay && (!minDate || intervalDay >= minDate) ? intervalDay : '');
  return day ? { ...row, [dateKey]: day, appointmentSchedulingVersion: 1 }
    : row[dateKey] === '待确认' ? { ...row, [dateKey]: '' } : row;
}
module.exports = { validDay, addMonths, appointmentDay, explicitSuggestedDay, evaluatedTiming };
