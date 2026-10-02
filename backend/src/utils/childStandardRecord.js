const mongoose = require('mongoose');
const forms = require('../../../shared/childStandardForms.json');
const { childAgeStage } = require('./childAgeStage');

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed;
}

function createChildStandardRecord(user, payload, actor, now = new Date()) {
  if (user.patientCategory !== 'child') fail('此会员不是儿童档案');
  const form = forms.find(item => item.id === payload.formId);
  if (!form || !form.schedule.includes(payload.schedule)) fail('分龄记录类型或访视节点无效');
  const visit = day(payload.visitDate);
  const birth = day(user.birthDate);
  const todayChina = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  if (!visit || !birth || visit < birth || payload.visitDate > todayChina) fail('请先核实出生日期及实际访视日期');
  const age = childAgeStage(user.birthDate, new Date(`${payload.visitDate}T12:00:00+08:00`));
  if (!age) fail('访视日期不在儿童年龄范围内');
  const years = visit.getUTCFullYear() - birth.getUTCFullYear() - ((visit.getUTCMonth() < birth.getUTCMonth() || (visit.getUTCMonth() === birth.getUTCMonth() && visit.getUTCDate() < birth.getUTCDate())) ? 1 : 0);
  const days = Math.floor((visit - birth) / 86400000);
  const matches = form.id === 'newborn_visit' ? days < 28
    : form.id === 'infant_1_8' ? days >= 28 && years < 1
      : form.id === 'toddler_12_30' ? years >= 1 && years < 3
        : form.id === 'preschool_3_6' ? years >= 3 && years < 7
          : years >= 6 && years < 18;
  if (!matches) fail('所选记录类型与访视时年龄不符');
  if (!['本机构检查', '外部报告转录'].includes(payload.sourceType)) fail('请选择检查资料来源');
  if (typeof payload.note !== 'string' || !payload.note.trim() || payload.note.length > 2000) fail('请填写记录依据');
  const allowed = new Map(form.fields.map(([key, label, type, options]) => [key, { label, type, options }]));
  const values = {};
  for (const [key, raw] of Object.entries(payload.values || {})) {
    const field = allowed.get(key);
    if (!field) fail('包含无效的记录字段');
    if (raw === '' || raw === null || raw === undefined) continue;
    if (field.type === 'number') {
      const number = Number(raw);
      if (!Number.isFinite(number) || number < 0 || number > 30000 || String(raw).trim() === '') fail(`${field.label}数值无效`);
      values[key] = number;
    } else if (field.type === 'select') {
      if (typeof raw !== 'string' || !field.options.includes(raw)) fail(`${field.label}选项无效`);
      values[key] = raw;
    } else {
      if (typeof raw !== 'string' || raw.trim().length > 4000) fail(`${field.label}内容无效`);
      values[key] = raw.trim();
    }
  }
  if (!Object.keys(values).length) fail('请至少填写一项检查或评估结果');
  let previous = null;
  if (payload.supersedesId) {
    if (!mongoose.isValidObjectId(payload.supersedesId)) fail('原记录编号无效');
    previous = (user.childStandardRecords || []).find(item => String(item._id) === String(payload.supersedesId));
    if (!previous || previous.formId !== form.id || previous.schedule !== payload.schedule || previous.visitDate !== payload.visitDate) fail('原记录与本次修订不一致');
    if ((user.childStandardRecords || []).some(item => String(item.supersedesId || '') === String(previous._id))) fail('原记录已有新版本，请刷新后修订', 409);
  }
  const record = { _id: new mongoose.Types.ObjectId(), formId: form.id, formTitle: form.title,
    standard: form.source, standardUrl: form.sourceUrl, schedule: payload.schedule, visitDate: payload.visitDate,
    ageStage: age, sourceType: payload.sourceType, note: payload.note.trim(), values,
    fieldLabels: Object.fromEntries(Object.keys(values).map(key => [key, allowed.get(key).label])),
    recordedAt: now, recordedBy: actor._id, recordedByName: actor.name || actor.username || '',
    supersedesId: previous?._id || null };
  return { record, filter: { _id: user._id, patientCategory: 'child', birthDate: user.birthDate,
    ...(previous ? { 'childStandardRecords._id': previous._id, 'childStandardRecords.supersedesId': { $ne: previous._id } }
      : { childStandardRecords: { $not: { $elemMatch: { formId: form.id, schedule: payload.schedule, visitDate: payload.visitDate } } } }) },
    update: { $push: { childStandardRecords: record } } };
}

module.exports = { createChildStandardRecord };
