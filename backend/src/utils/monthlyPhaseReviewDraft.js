const HealthRecord = require('../models/HealthRecord');
const FollowUp = require('../models/FollowUp');
const MedicalReport = require('../models/MedicalReport');
const ServiceRecord = require('../models/ServiceRecord');
const { comparableWeightChange } = require('./phaseAssessmentWeightEvidence');

const day = value => value ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '';
const text = value => String(value || '').replace(/\s+/g, ' ').trim();

// This worksheet stays inside Jiayicare. It never calls an external AI provider.
async function buildMonthlyPhaseReviewDraft(user, window) {
  const start = new Date(window.start), end = new Date(window.end);
  const startDay = new Date(start.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const endDay = new Date(end.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const [records, followups, visits, reports] = await Promise.all([
    HealthRecord.find({ user: user._id, recordedAt: { $gte: start, $lte: end } }).sort({ recordedAt: 1 }).limit(500).select('type label value unit note recordedAt').lean(),
    FollowUp.find({ patientId: user._id, date: { $gte: start, $lte: end } }).sort({ date: 1 }).limit(200).select('date theme status plannedContent executedContent cancelReason isBlocked').lean(),
    ServiceRecord.find({ patientId: user._id, type: 'medical_visit', date: { $gte: start, $lte: end }, aiStatus: { $ne: 'pending' } }).sort({ date: 1 }).limit(100).select('date title medicalEscort.hospital medicalEscort.department supplements.kind supplements.visit.appointmentAt').lean(),
    MedicalReport.find({ user: user._id, audit_status: 'audited', checkDate: { $gte: startDay, $lte: endDay } }).sort({ checkDate: 1 }).limit(100).select('checkDate title type documentCategory screeningItemId screeningL1 screeningCategory reportItems.name reportItems.value reportItems.unit reportItems.status reportItems.conclusion reportItems.screeningKey reportItems.screeningKeys').lean(),
  ]);
  const blocks=require('./reviewFourSections');
  const lines=blocks.sections({records,followups,reports}).map((items,index)=>[`${['一','二','三','四'][index]}、${blocks.headings[index]}`,...items]);
  return {
    content: lines.map(([heading, ...items]) => `${heading}\n${items.map(item => `- ${item}`).join('\n')}`).join('\n\n'),
    sources: [`本月健康记录${records.length}条`, `本月服务随访${followups.length}条`, `本月就医服务记录${visits.length}条`, `本月已审核检查报告${reports.length}份`, '原始报告与完整服务档案由健康顾问人工核对'],
  };
}

module.exports = { buildMonthlyPhaseReviewDraft };
