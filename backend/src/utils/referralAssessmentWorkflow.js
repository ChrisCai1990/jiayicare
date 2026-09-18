const FollowUp = require('../models/FollowUp');
const ProfessionalHealthAssessment = require('../models/ProfessionalHealthAssessment');
const User = require('../models/User');

const lines = value => String(value || '').split(/[\n；;]/).map(item => item.trim()).filter(Boolean);
const annualPurpose = referral => /年度|管理方案|综合健康评估|首次方案/.test(`${referral.referralPurpose || ''} ${referral.reason || ''}`);
const domainOf = referral => referral.medicalExpertSnapshot?.departmentName || referral.linkedDiseaseName || '综合健康';

async function createReferralWorkbenchTask(referral) {
  if (!referral.toStaffId) return null;
  return FollowUp.findOneAndUpdate(
    { sourceType: 'professional_assessment', sourceId: referral._id, workflowKey: 'professional_assessment:professional_review' },
    { $set: {
      patientId: referral.patientId, staffId: referral.fromStaffId, assignedTo: referral.toStaffId,
      date: new Date(), remindAt: new Date(), type: 'other', status: 'planned',
      theme: `专业健康评估 · ${domainOf(referral)}`, plannedContent: `请完成转介反馈并提交专业评估意见。转介原因：${referral.reason}`,
      content: referral.content || '', tags: ['专业健康评估', '转介'], taskRole: 'executor', isBlocked: false,
      coordinationGroupId: `professional-assessment:${referral._id}`, aiStatus: 'approved', reviewRole: null,
    }, $setOnInsert: { sourceType: 'professional_assessment', sourceId: referral._id, workflowKey: 'professional_assessment:professional_review' } },
    { upsert: true, new: true },
  );
}

async function completeReferralAndCreateAdvisorReview(referral, reviewer) {
  await FollowUp.updateMany(
    { sourceType: 'professional_assessment', sourceId: referral._id, workflowKey: 'professional_assessment:professional_review', status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', executedContent: '转介反馈已提交，系统自动完成。' } },
  );
  const c = referral.consultation?.toObject?.() || referral.consultation || {};
  const purpose = annualPurpose(referral) ? 'annual_input' : 'issue_collaboration';
  const assessment = await ProfessionalHealthAssessment.findOneAndUpdate(
    { sourceReferralIds: referral._id },
    { $set: {
      patientId: referral.patientId, purpose, domain: domainOf(referral), title: referral.reason,
      collaborationMode: 'single_discipline', linkedDiseaseRecordId: referral.linkedDiseaseRecordId || null,
      linkedDiseaseName: referral.linkedDiseaseName || '', sourceReferralIds: [referral._id], sourceCutoffAt: new Date(),
      facts: lines(referral.responseAnalysis || referral.response), risks: lines(c.riskWarning),
      missingInformation: [], recommendations: {
        medicalVisit: lines(referral.responseOpinion), examinations: lines(c.examinationAdvice),
        followUps: lines(c.nextPlan), lifestyle: [], services: [],
      },
      aiDraft: { source: 'referral_feedback', generatedAt: new Date(), requiresHumanReview: true },
      status: 'advisor_review', professionalReviewerIds: reviewer?._id ? [reviewer._id] : [], professionalReviewedAt: new Date(),
      createdBy: reviewer?._id || referral.toStaffId || referral.fromStaffId, createdByRole: reviewer?.role || '',
    }, $push: { auditLog: { action: 'generated_from_referral', at: new Date(), by: reviewer?._id || referral.toStaffId, role: reviewer?.role || '' } } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const patient = await User.findById(referral.patientId).select('assignedFamilyDoctor').lean();
  if (patient?.assignedFamilyDoctor) {
    await FollowUp.findOneAndUpdate(
      { sourceType: 'professional_assessment', sourceId: assessment._id, workflowKey: 'professional_assessment:advisor_review' },
      { $set: {
        patientId: referral.patientId, staffId: reviewer?._id || referral.fromStaffId, assignedTo: patient.assignedFamilyDoctor,
        date: new Date(), remindAt: new Date(), type: 'other', status: 'planned', theme: `终审专业健康评估 · ${assessment.domain}`,
        plannedContent: '请核对专业人员意见，确认其作为年度方案输入或后续问题协作记录。', tags: ['专业健康评估', '待终审'],
        taskRole: 'executor', isBlocked: false, coordinationGroupId: `professional-assessment:${assessment._id}`, aiStatus: 'approved', reviewRole: 'familyDoctor',
      }, $setOnInsert: { sourceType: 'professional_assessment', sourceId: assessment._id, workflowKey: 'professional_assessment:advisor_review' } },
      { upsert: true },
    );
  }
  return assessment;
}

async function completeAdvisorReviewTask(assessmentId) {
  return FollowUp.updateMany(
    { sourceType: 'professional_assessment', sourceId: assessmentId, workflowKey: 'professional_assessment:advisor_review', status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', executedContent: '健康顾问已完成终审，系统自动完成。' } },
  );
}

module.exports = { createReferralWorkbenchTask, completeReferralAndCreateAdvisorReview, completeAdvisorReviewTask };
