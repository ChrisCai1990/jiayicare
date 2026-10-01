const KINDS = { water: '饮水', medication: '用药', supplement: '营养素' };
function normalize(value) {
  if (!value?.enabled) return null;
  const fail = message => { throw Object.assign(new Error(message), {statusCode:400}); };
  if (!KINDS[value.kind]) fail('请选择健康数据类型');
  const validDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  if (!validDay(value.startDate) || !validDay(value.endDate) || value.endDate < value.startDate) fail('请填写有效的健康数据记录起止日期');
  const reminderDays = Number(value.reminderDays), followUpDays = Number(value.followUpDays);
  if (![reminderDays, followUpDays].every(n => Number.isInteger(n) && n >= 1 && n <= 365)) fail('提醒与随访间隔须为1至365天');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.reminderTime || '')) fail('请填写提醒时间');
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(value.id || '')) fail('健康数据计划标识缺失，请重新开启');
  return {enabled:true,id:value.id,kind:value.kind,startDate:value.startDate,endDate:value.endDate,reminderDays,followUpDays,reminderTime:value.reminderTime};
}
function nextContact(config, now, explicit) {
  const date = explicit ? new Date(explicit) : new Date(+now + config.followUpDays * 86400000);
  if (!Number.isFinite(+date) || date <= now) throw Object.assign(new Error('下次跟进时间须晚于当前时间'), {statusCode:400});
  return date;
}
module.exports = { KINDS, normalize, nextContact };
