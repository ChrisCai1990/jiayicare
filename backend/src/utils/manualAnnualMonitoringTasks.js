const mongoose = require('mongoose');
const { createHash } = require('node:crypto');
const FollowUp = require('../models/FollowUp');
const { manualMonitoringItems } = require('./manualAnnualMonitoring');

const active = ['planned', 'in_progress', 'missed'];

function firstFollowUpDate(value, now = new Date()) {
  const date = String(value || '');
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today ||
    !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return null;
  return new Date(`${date}T00:00:00+08:00`);
}

async function createManualAnnualMonitoringTasks({ plan, patient, manager, staffId }) {
  const monitoring = plan.moduleData?.monitoring;
  if (monitoring?.clientAppUsage !== 'no') return { created: 0, total: 0 };
  const rows = manualMonitoringItems(plan.moduleData);
  const identity = type => new mongoose.Types.ObjectId(createHash('sha256')
    .update(`manual-monitoring:v3:${patient._id}:${plan._id}:${type}`).digest('hex').slice(0, 24));
  const existing = await Promise.all(rows.map(row => FollowUp.exists({ _id: identity(row.type) })));
  if (existing.every(Boolean)) return { created: 0, total: rows.length };
  const date = firstFollowUpDate(monitoring.firstManualFollowUpDate);
  if (!date) { const error = new Error('请先确认人工监测首次随访日期'); error.statusCode = 400; throw error; }
  if (!manager?._id || String(patient.assignedHealthManager || '') !== String(manager._id)) {
    const error = new Error('请先为客户指定责任健管专员'); error.statusCode = 400; throw error;
  }
  for (const row of rows) {
    const conflict = await FollowUp.exists({ patientId: patient._id, repeatWeekly: true, clientVisible: false,
      checkInItems: row.type, _id: { $ne: identity(row.type) }, status: { $in: active } });
    if (conflict) { const error = new Error(`已有${row.label}的人工监测随访，请先核对原任务`); error.statusCode = 409; throw error; }
  }
  let created = 0;
  for (const row of rows) {
    const _id = identity(row.type);
    const content = `客户不使用 App／小程序；请健管专员按${row.frequency}联系客户，记录${row.label}${row.period ? `（${row.period}）` : ''}的监测结果；本次完成后按该周期接续。`;
    const formData = { '监测频率': row.frequency, manualNoClientApp: true, monitoringMetricType: row.type, confirmedBy: String(staffId) };
    const template = { type: 'phone', theme: `人工健康监测 · ${row.label}`, content, formData, checkInItems: [row.type] };
    const result = await FollowUp.updateOne({ _id }, { $setOnInsert: { _id, tenantId: patient.tenantId,
      patientId: patient._id, sourceAnnualPlanId: plan._id, staffId, assignedTo: manager._id,
      date, status: 'planned', clientVisible: false, repeatWeekly: true, weeklyTemplate: template,
      theme: template.theme, content, plannedContent: content, type: 'phone', formData,
      checkInItems: template.checkInItems, aiStatus: 'approved' } }, { upsert: true, setDefaultsOnInsert: true });
    created += result.upsertedCount || 0;
  }
  return { created, total: rows.length };
}

module.exports = { firstFollowUpDate, createManualAnnualMonitoringTasks };
