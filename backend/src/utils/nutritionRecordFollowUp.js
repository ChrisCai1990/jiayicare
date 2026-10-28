const crypto = require('crypto');
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const ServiceRecord = require('../models/ServiceRecord');
const User = require('../models/User');

const taskIdFor = recordId => new mongoose.Types.ObjectId(
  crypto.createHash('sha256').update(`nutrition-record-followup:${recordId}`).digest('hex').slice(0, 24)
);

function chinaDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function dueAt(value) {
  const day = chinaDate(value);
  return day ? new Date(`${day}T09:00:00+08:00`) : null;
}

async function sync(record) {
  if (record.type !== 'nutrition') return;
  const _id = taskIdFor(record._id);
  const current = await FollowUp.findById(_id);
  const active = record.aiStatus !== 'pending' && record.nextDate && dueAt(record.nextDate);
  if (!active) {
    if (current && ['planned', 'in_progress', 'missed'].includes(current.status)) {
      current.status = 'cancelled';
      current.cancelReason = '原营养干预记录已清除下次计划日期或撤回';
      await current.save();
    }
    return current;
  }
  if (current?.status === 'completed') return current;
  const patient = await User.findById(record.patientId).select('tenantId assignedNutritionist isDeleted').lean();
  if (!patient || patient.isDeleted || !patient.assignedNutritionist) return null;
  const date = dueAt(record.nextDate);
  const title = String(record.title || '营养干预').trim().slice(0, 80);
  const theme = String(record.nextFollowUpTheme || '').trim().slice(0, 80) || current?.theme || `营养干预随访 · ${title}`;
  const fields = { patientId: record.patientId, tenantId: patient.tenantId || null,
    staffId: patient.assignedNutritionist, assignedTo: patient.assignedNutritionist,
    sourceType: 'service_record', sourceId: record._id,
    date, nextFollowUpDate: date, remindAt: new Date(),
    theme, plannedContent: '按上次营养干预记录约定随访，核对执行情况、指标变化和下一步安排。',
    content: '按上次营养干预记录约定随访，核对执行情况、指标变化和下一步安排。',
    tags: ['人工跟进', '营养干预记录预约'], status: current?.status === 'in_progress' ? 'in_progress' : 'planned' };
  if (current) {
    Object.assign(current, fields);
    current.cancelReason = '';
    await current.save();
    return current;
  }
  return FollowUp.findOneAndUpdate({ _id }, { $setOnInsert: fields }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

async function reconcileUpcoming() {
  const today = chinaDate(new Date());
  const records = ServiceRecord.find({ type: 'nutrition', nextDate: { $gte: new Date(`${today}T00:00:00+08:00`) },
    aiStatus: { $ne: 'pending' } }).select('_id patientId type title nextDate nextFollowUpTheme aiStatus').sort({ nextDate: 1 }).limit(5000).cursor();
  let count = 0;
  for await (const record of records) {
    await sync(record);
    count++;
  }
  return count;
}

module.exports = { sync, reconcileUpcoming, taskIdFor, chinaDate };
