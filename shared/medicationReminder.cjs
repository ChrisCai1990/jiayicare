const DAY = 86400000;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const beijingDate = (now = new Date()) => new Date(+now + 8 * 3600000).toISOString().slice(0, 10);
function dateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('请填写有效的提醒日期');
  const date = new Date(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(+date) || beijingDate(date) !== value) throw new Error('请填写有效的提醒日期');
  return +date;
}
function suggestedTimes(med = {}) {
  const frequency = String(med.frequency || '').replace(/\s/g, '');
  if (/按需|必要时|每周|每月|隔日|每[2-9二三四五六七八九]天/.test(frequency)) return ['09:00'];
  if (/一日三餐|每日三餐|早中晚|^(?:tid)$/i.test(frequency) || /(?:每天|每日|一天|一日|日)[3三]次|[3三]次[/／]日/.test(frequency)) return ['08:00', '12:00', '18:00'];
  if (/^(?:bid)$/i.test(frequency) || /(?:每天|每日|一天|一日|日)[2二两]次|[2二两]次[/／]日/.test(frequency)) return ['08:00', '18:00'];
  if (/^(?:qid)$/i.test(frequency) || /(?:每天|每日|一天|一日|日)[4四]次|[4四]次[/／]日/.test(frequency)) return ['08:00', '12:00', '18:00', '21:00'];
  return ['09:00'];
}
function initialForm(med, now = new Date()) {
  const saved = med.reminder || {};
  const times = saved.remindTimes?.length ? [...saved.remindTimes] : saved.enabled ? [saved.remindTime || '09:00'] : suggestedTimes(med);
  return { intervalDays: saved.enabled ? saved.intervalDays || 1 : 1, startDate: saved.startDate > beijingDate(now) ? saved.startDate : beijingDate(now),
    endDate: saved.endDate || med.endDate || '', remindTimes: times, note: saved.note || '' };
}
function schedule(input, med = {}, now = new Date()) {
  const intervalDays = Number(input.intervalDays ?? 1);
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) throw new Error('提醒周期须为1至365天');
  const times = input.remindTimes === undefined ? [input.remindTime || '09:00'] : input.remindTimes;
  if (!Array.isArray(times) || times.length < 1 || times.length > 6 || times.some(t => typeof t !== 'string' || !timePattern.test(t))) throw new Error('请设置1至6个有效提醒时间');
  if (new Set(times).size !== times.length) throw new Error('提醒时间不能重复');
  const remindTimes = [...times].sort();
  const startDate = input.startDate || beijingDate(now), start = dateValue(startDate);
  const endDate = input.endDate || med.endDate || beijingDate(new Date(start + 364 * DAY)), end = dateValue(endDate);
  if (end < start) throw new Error('结束日期不能早于开始日期');
  if (end - start >= 366 * DAY) throw new Error('一次最多生成一年的用药提醒，请缩短日期范围');
  const dates = [];
  for (let day = start; day <= end; day += intervalDays * DAY) {
    for (const time of remindTimes) {
      const date = new Date(`${beijingDate(new Date(day))}T${time}:00+08:00`);
      if (+date >= +now) dates.push({ date, time });
    }
  }
  if (!dates.length) throw new Error('所选日期内已无未来提醒时间，请调整日期或时间');
  return { intervalDays, startDate, endDate, remindTimes, remindTime: remindTimes[0], note: String(input.note || '').trim(), dates };
}
module.exports = { beijingDate, suggestedTimes, initialForm, schedule };
