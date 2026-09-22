const { createHash } = require('node:crypto');
const CLINICAL_FIELDS = ['title', 'checkDate', 'institution', 'documentCategory', 'examDescription', 'examConclusion', 'examMainConclusions', 'reportItems', 'sourceOrderId', 'sourceHealthPlanId', 'planId', 'sourceServiceRecordId'];
const CATEGORIES = ['outpatient_record', 'inpatient_record', 'lab_report', 'exam_report', 'physical_exam'];
const plain = value => value?.toObject ? value.toObject() : value;
function reportSnapshot(report) {
  return {
    title: report.title || '', checkDate: report.checkDate || '', institution: report.institution || '', documentCategory: report.documentCategory || '',
    examDescription: report.examDescription || '', examConclusion: report.examConclusion || '', examMainConclusions: plain(report.examMainConclusions) || {},
    items: (report.reportItems || []).map(item => Object.fromEntries(['name', 'value', 'unit', 'referenceRange', 'status', 'findings', 'diagnosis', 'conclusion', 'examDate'].map(key => [key, item[key] ?? '']))),
  };
}
function sourceDigest(report) {
  return createHash('sha256').update(JSON.stringify({ snapshot: reportSnapshot(report), service: [report.sourceOrderId, report.sourceHealthPlanId, report.planId, report.sourceServiceRecordId].map(id => String(id || '')) })).digest('hex');
}
function markReportFollowUpEvent(report) {
  if (!require('./healthManagementRollout').enabledForPatient(report.user)) return;
  if (report.audit_status !== 'audited' || !CATEGORIES.includes(report.documentCategory)) return;
  if (!report.isModified('audit_status') && !CLINICAL_FIELDS.some(field => report.isModified(field))) return;
  const digest = sourceDigest(report);
  if (report.followUpSourceEvent?.digest === digest && !report.isModified('audit_status')) return;
  report.followUpSourceEvent = { status: 'queued', digest, sequence: (report.followUpSourceEvent?.sequence || 0) + 1, queuedAt: new Date() };
}
function isReportSourceCurrent(draft, report) {
  return !!report && String(report.user) === String(draft.patientId) && report.audit_status === 'audited'
    && report.followUpSourceEvent?.sequence === draft.sourceSequence && `${report._id}:${report.followUpSourceEvent.sequence}:${sourceDigest(report)}` === draft.sourceKey;
}
async function reportExclusion(report, dependencies = {}) {
  if (!report || report.audit_status !== 'audited') return '来源报告尚未审核或已撤销审核。';
  if (report.sourceOrderId || report.sourceHealthPlanId || report.planId || report.sourceServiceRecordId) return '来源已有关联服务，继续由原工作流承接。';
  const AbnormalReview = dependencies.AbnormalReview || require('../models/AbnormalReview');
  if (await AbnormalReview.exists({ patientId: report.user, reportId: report._id })) return '已生成异常复查，避免重复派发。';
  const FollowUp = dependencies.FollowUp || require('../models/FollowUp');
  if (await FollowUp.exists({ patientId: report.user, $or: [{ sourceId: report._id }, { 'formData.reportId': report._id }] })) return '来源已有随访安排，请核对原计划。';
  // 原审核逻辑可能在没有显式 report.planId 时也命中客户的条件服务节点。
  const Plan = dependencies.HealthPlan || require('../models/HealthPlan');
  if (await Plan.exists({ patientId: report.user, status: 'active', type: 'medical_assist', $or: [{ 'content.workflowModules.mode': 'conditional' }, { 'content.followUpPlans.mode': 'conditional' }] })) return '客户已有条件式就医服务，先由原流程确认后续安排。';
  const Referral = dependencies.Referral || require('../models/Referral');
  if (await Referral.exists({ patientId: report.user, 'consultation.sourceReportId': report._id, status: { $ne: 'rejected' } })) return '此报告已用于会诊，避免与会诊随访重复。';
  return '';
}
module.exports = { CLINICAL_FIELDS, CATEGORIES, reportSnapshot, sourceDigest, markReportFollowUpEvent, isReportSourceCurrent, reportExclusion };
