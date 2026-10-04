const HealthRiskEvent = require('../models/HealthRiskEvent');
const User = require('../models/User');
const { createHash } = require('crypto');
const { enabledForPatient } = require('./healthRiskRollout');

const RULE_VERSION = '2026-10-03-v1';
const DAY = 24 * 60 * 60 * 1000;

function recordCandidate(record) {
  if (!record || record.deletedAt || record.status !== 'danger') return null;
  if (!record.recordedAt || Date.now() - new Date(record.recordedAt).getTime() > 7 * DAY) return null;
  if (new Date(record.recordedAt).getTime() > Date.now() + 5 * 60 * 1000) return null;
  const type = record.type;
  if (!['bloodPressure', 'bloodSugar'].includes(type)) return null;
  const raw = type === 'bloodPressure'
    ? `${record.extra?.sys ?? String(record.value || '').split('/')[0]}/${record.extra?.dia ?? (String(record.value || '').split('/')[1] || '-')}`
    : String(record.value || '');
  const label = type === 'bloodPressure' ? '血压' : '血糖';
  return {
    ruleCode: `${type}_existing_danger_status`,
    level: 'review',
    title: `${label}记录待核对`,
    summary: `新录入${label}数值被现有打卡规则标记为异常，请核对原始记录、测量条件及客户情况。`,
    evidence: { recordedAt: record.recordedAt, value: raw, unit: record.unit || '', status: record.status, source: 'health_record' },
  };
}

function reportCandidate(report) {
  if (!report || report.audit_status !== 'audited') return null;
  const checkDate = String(report.checkDate || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(checkDate)) {
    const checkedAt = new Date(`${checkDate}T00:00:00+08:00`);
    if (Number.isFinite(checkedAt.getTime()) && Date.now() - checkedAt.getTime() > 365 * DAY) return null;
  }
  const items = (report.reportItems || []).filter(item => ['abnormal', 'attention'].includes(item.status) && item.itemType !== 'medication');
  if (!items.length) return null;
  return {
    ruleCode: 'audited_report_abnormal_items', level: 'review',
    title: '已审核报告异常项目待核对',
    summary: `${report.title || '体检报告'}有${items.length}项标记异常或需关注，请结合原报告和既有随访安排核对。`,
    evidence: {
      reportTitle: report.title || '', checkDate: report.checkDate || '', auditedAt: report.audited_at || null,
      items: items.slice(0, 30).map(item => ({ itemId: item.itemId || '', name: item.name || '', value: item.value || '', unit: item.unit || '', status: item.status, sourcePage: item.sourcePage || null })),
      totalCount: items.length, source: 'medical_report',
    },
  };
}

function bloodPressureTrendCandidate(records = []) {
  if (records.length < 3 || records.some(record => record.type !== 'bloodPressure' || record.status !== 'warning' || record.deletedAt)) return null;
  const latest = records[0];
  if (!latest?.recordedAt || Date.now() - new Date(latest.recordedAt).getTime() > 7 * DAY) return null;
  return {
    ruleCode: 'three_recent_bp_warning_records', level: 'review',
    title: '连续血压记录需核对',
    summary: '近期连续三次血压记录均被现有打卡规则标为“需关注”，请核对测量条件、原始记录和客户情况。',
    evidence: { source: 'monitoring_trend', records: records.map(record => ({
      id: String(record._id), recordedAt: record.recordedAt,
      value: `${record.extra?.sys ?? String(record.value || '').split('/')[0]}/${record.extra?.dia ?? (String(record.value || '').split('/')[1] || '-')}`,
      unit: record.unit || 'mmHg', status: record.status,
    })) },
  };
}

async function syncRiskEvent({ patientId, tenantId, sourceType, sourceId, candidate, eventKey: customEventKey }, dependencies = {}) {
  if (!(dependencies.enabledForPatient || enabledForPatient)(patientId)) return null;
  const Event = dependencies.Event || HealthRiskEvent;
  const Patient = dependencies.Patient || User;
  const eventKey = customEventKey || `${sourceType}:${sourceId}`;
  const existing = await Event.findOne({ eventKey });
  if (!candidate) {
    if (existing?.status === 'pending') await Event.updateOne(
      { _id: existing._id, status: 'pending' },
      { $set: { status: 'superseded', disposition: 'source_corrected', decidedAt: new Date(), decisionNote: '来源资料已更正或不再符合原标记，待办自动撤回。' },
        $push: { history: { at: new Date(), action: 'source_corrected', note: '来源资料已更正或不再符合原标记' } } },
    );
    return null;
  }
  const sourceFingerprint = createHash('sha256').update(JSON.stringify(candidate.evidence)).digest('hex');
  if (existing?.status === 'closed' && (!existing.sourceFingerprint || existing.sourceFingerprint === sourceFingerprint)) return existing;
  const patient = await Patient.findById(patientId).select('tenantId assignedFamilyDoctor').lean();
  if (!patient) return null;
  const now = new Date();
  const update = {
    patientId, sourceType, sourceId,
    ruleCode: candidate.ruleCode, ruleVersion: RULE_VERSION, level: candidate.level,
    title: candidate.title, summary: candidate.summary, evidence: candidate.evidence, sourceFingerprint,
    assignedTo: patient.assignedFamilyDoctor || null,
  };
  if (existing) {
    const reopening = existing.status === 'superseded' || existing.status === 'closed';
    if (reopening) Object.assign(update, { status: 'pending', detectedAt: now, dueAt: new Date(now.getTime() + DAY), disposition: '', decisionNote: '', decidedAt: null, decidedBy: null, decidedByName: '' });
    await Event.updateOne({ _id: existing._id }, { $set: update,
      ...(reopening ? { $push: { history: { at: now, action: 'reopened_after_source_change', ruleVersion: RULE_VERSION } } } : {}) });
    return Event.findById(existing._id);
  }
  try {
    return await Event.create({ eventKey, tenantId: tenantId || patient.tenantId || null, ...update, detectedAt: now, dueAt: new Date(now.getTime() + DAY), history: [{ at: now, action: 'detected', ruleVersion: RULE_VERSION }] });
  } catch (error) {
    if (error.code === 11000) return Event.findOne({ eventKey });
    throw error;
  }
}

async function syncRecordRisk(record) {
  if (!enabledForPatient(record.user)) return null;
  const single = await syncRiskEvent({ patientId: record.user, tenantId: record.tenantId, sourceType: 'health_record', sourceId: record._id, candidate: recordCandidate(record) });
  if (record.type !== 'bloodPressure') return single;
  const HealthRecord = require('../models/HealthRecord');
  const recent = await HealthRecord.find({ user: record.user, type: 'bloodPressure',
    recordedAt: { $gte: new Date(Date.now() - 30 * DAY), $lte: new Date() } })
    .sort({ recordedAt: -1 }).limit(3).lean();
  const candidate = bloodPressureTrendCandidate(recent);
  await syncRiskEvent({ patientId: record.user, tenantId: record.tenantId,
    sourceType: 'monitoring_trend', sourceId: recent[0]?._id || record._id,
    eventKey: `monitoring_trend:bloodPressure:${record.user}`, candidate });
  return single;
}
async function syncReportRisk(report) {
  if (!enabledForPatient(report.user)) return null;
  return syncRiskEvent({ patientId: report.user, tenantId: report.tenantId, sourceType: 'medical_report', sourceId: report._id, candidate: reportCandidate(report) });
}

module.exports = { RULE_VERSION, recordCandidate, reportCandidate, bloodPressureTrendCandidate, syncRiskEvent, syncRecordRisk, syncReportRisk };
