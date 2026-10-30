const { createHash } = require('node:crypto');
const mongoose = require('mongoose');

function monitoringRecordId(followUpId) {
  return new mongoose.Types.ObjectId(createHash('sha256')
    .update(`staff-monitoring-follow-up:v1:${String(followUpId)}`).digest().subarray(0, 12));
}

function monitoringMeasurement(body, expectedType, now = new Date()) {
  const recordedAt = body.recordedAt ? new Date(body.recordedAt) : now;
  if (!Number.isFinite(recordedAt.getTime()) || recordedAt.getTime() > now.getTime() + 5 * 60000) {
    throw new Error('请填写有效的实际测量时间，不能填写未来时间');
  }
  const note = String(body.note || '').trim();
  if (note.length > 1000) throw new Error('测量备注不能超过1000字');
  if (expectedType === 'bloodPressure') {
    const sys = Number(body.sys); const dia = Number(body.dia);
    if (!Number.isFinite(sys) || !Number.isFinite(dia) || sys <= 0 || dia <= 0 || sys <= dia) {
      throw new Error('请填写有效的收缩压和舒张压，收缩压应高于舒张压');
    }
    return { type: 'bloodPressure', category: 'vitals', label: '血压', unit: 'mmHg',
      value: `${sys}/${dia}`, extra: { sys, dia }, vitals: { systolic: sys, diastolic: dia }, recordedAt, note };
  }
  if (expectedType === 'weight') {
    const weight = Number(body.weight);
    if (!Number.isFinite(weight) || weight <= 0) throw new Error('请填写大于0的体重（kg）');
    return { type: 'weight', category: 'metabolism', label: '体重', unit: 'kg',
      value: String(weight), extra: {}, vitals: { weight }, recordedAt, note };
  }
  throw new Error('该随访计划不支持从这里录入监测数据');
}

module.exports = { monitoringRecordId, monitoringMeasurement };
