const FollowUp = require('../models/FollowUp');
const ProfessionalHealthAssessment = require('../models/ProfessionalHealthAssessment');
const User = require('../models/User');
const { createHash } = require('node:crypto');
const { initialFollowUpAutomation } = require('./assessmentFollowUpAutomation');

const lines = value => String(value || '').split(/[\n；;]/).map(item => item.trim()).filter(Boolean);
const annualPurpose = referral => /年度|管理方案|综合健康评估|首次方案/.test(`${referral.referralPurpose || ''} ${referral.reason || ''}`);
const domainOf = referral => referral.medicalExpertSnapshot?.departmentName || referral.linkedDiseaseName || '综合健康';

function referralAssessmentSource(referral) {
  const c = referral.consultation?.toObject?.() || referral.consultation || {};
  const purpose = annualPurpose(referral) ? 'annual_input' : 'issue_collaboration';
  const snapshot = {
    patientId: referral.patientId, purpose, domain: domainOf(referral), title: referral.reason,
    collaborationMode: 'single_discipline', linkedDiseaseRecordId: referral.linkedDiseaseRecordId || null,
    linkedDiseaseName: referral.linkedDiseaseName || '', sourceReferralIds: [referral._id],
    sourceRecordIds: c.sourceReportId ? [c.sourceReportId] : [],
    facts: lines(referral.responseAnalysis || referral.response), risks: lines(c.riskWarning),
    missingInformation: [], recommendations: {
      medicalVisit: lines(referral.responseOpinion), examinations: lines(c.examinationAdvice),
      followUps: lines(c.nextPlan), lifestyle: [], services: [],
    },
  };
  const clinicalSource = Object.fromEntries(['diagnosis', 'treatmentAdvice', 'medicationAdvice', 'sourceInstitution', 'sourceDepartment', 'sourceDoctor', 'sourceDate', 'verificationStatus', 'feedbackType', 'noMedicalConclusion'].map(key => [key, c[key] ?? null]));
  const digest = createHash('sha256').update(JSON.stringify({ snapshot, clinicalSource })).digest('hex');
  // A→B→A 是第三次修订，不能复用第一次已淘汰的记录；原样重发不增加版本。
  const sourceFeedbackKey = `${referral._id}:${referral.feedbackVersion || 0}:${digest}`;
  return { c, purpose, snapshot, sourceFeedbackKey, digest };
}

async function isAssessmentSourceCurrent(assessment, dependencies = {}) {
  if (!assessment.sourceFeedbackKey) return true; // 旧数据不追溯迁移。
  const Referral = dependencies.Referral || require('../models/Referral');
  const source = await Referral.findById(assessment.sourceReferralIds[0]).lean();
  return !!source && source.status === 'completed' && referralAssessmentSource(source).sourceFeedbackKey === assessment.sourceFeedbackKey;
}

async function createReferralWorkbenchTask(referral) {
  if (!require('./healthManagementRollout').enabledForPatient(referral.patientId)) return;
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
  if (!require('./healthManagementRollout').enabledForPatient(referral.patientId)) return null;
  await FollowUp.updateMany(
    { sourceType: 'professional_assessment', sourceId: referral._id, workflowKey: 'professional_assessment:professional_review', status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', executedContent: '转介反馈已提交，系统自动完成。' } },
  );
  const { c, purpose, snapshot, sourceFeedbackKey } = referralAssessmentSource(referral);
  // 内容相同的重复提交复用原记录；修订后新建，旧审核结论及已发布任务不变。
  const previous = await ProfessionalHealthAssessment.findOne({ sourceReferralIds: referral._id, sourceFeedbackKey: { $ne: sourceFeedbackKey } }).sort({ createdAt: -1 }).lean();
  let assessment;
  try {
    assessment = await ProfessionalHealthAssessment.findOneAndUpdate(
    { sourceFeedbackKey },
    { $setOnInsert: { ...snapshot, sourceFeedbackKey, sourceCutoffAt: referral.respondedAt || new Date(),
      supersedesAssessmentId: previous?._id || null,
      followUpAutomation: initialFollowUpAutomation(purpose),
      aiDraft: { source: 'referral_feedback', generatedAt: new Date(), requiresHumanReview: true, externalSourceUnverified: c.feedbackType === 'external_medical_record' && c.verificationStatus !== 'source_verified' },
      status: 'advisor_review', professionalReviewerIds: reviewer?._id ? [reviewer._id] : [], professionalReviewedAt: new Date(),
      createdBy: reviewer?._id || referral.toStaffId || referral.fromStaffId, createdByRole: reviewer?.role || '',
      auditLog: [{ action: 'generated_from_referral', at: new Date(), by: reviewer?._id || referral.toStaffId, role: reviewer?.role || '' }],
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  } catch (error) {
    if (error.code !== 11000) throw error;
    assessment = await ProfessionalHealthAssessment.findOne({ sourceFeedbackKey });
    if (!assessment) throw error;
  }
  // 仅淘汰更早的未审核草稿；同一源反馈被修订时，旧AI结果也不能落库。
  if (previous && !['approved', 'superseded'].includes(previous.status) && new Date(previous.sourceCutoffAt || previous.createdAt) < new Date(assessment.sourceCutoffAt)) {
    const retired = await ProfessionalHealthAssessment.findOneAndUpdate({ _id: previous._id, status: { $in: ['draft', 'professional_review', 'advisor_review', 'rejected'] } }, {
      $set: { status: 'superseded', supersededByAssessmentId: assessment._id }, $inc: { __v: 1 },
    }, { new: true });
    if (retired) await completeAdvisorReviewTask(previous._id);
  }
  await ensureAdvisorReviewTask(assessment);
  return assessment;
}

async function ensureAdvisorReviewTask(assessment) {
  if (!assessment || assessment.status !== 'advisor_review') return;
  if (!require('./healthManagementRollout').enabledForPatient(assessment.patientId)) return;
  const patient = await User.findById(assessment.patientId).select('assignedFamilyDoctor assignedHealthPlanner assignedHealthManager').lean();
  const owner = patient?.assignedFamilyDoctor || patient?.assignedHealthPlanner || patient?.assignedHealthManager || assessment.createdBy;
  if (owner) {
    try {
    await FollowUp.findOneAndUpdate(
      { sourceType: 'professional_assessment', sourceId: assessment._id, workflowKey: 'professional_assessment:advisor_review' },
      { $set: {
        patientId: assessment.patientId, staffId: assessment.createdBy, assignedTo: owner,
        assessmentActionKey: `${assessment._id}:advisor_review`,
        theme: `${patient?.assignedFamilyDoctor ? '终审专业健康评估' : '请先分配健康顾问'} · ${assessment.domain}`,
        plannedContent: patient?.assignedFamilyDoctor ? '请核对专业意见及系统整理的随访草稿；终审后才发布正式随访。' : '该客户缺少健康顾问，无法生成/审核随访，请联系管理员完成分配。', tags: ['专业健康评估', '待终审'],
        taskRole: 'executor', isBlocked: false, coordinationGroupId: `professional-assessment:${assessment._id}`, aiStatus: 'approved', reviewRole: 'familyDoctor',
      }, $setOnInsert: { date: new Date(), remindAt: new Date(), type: 'other', status: 'planned', sourceType: 'professional_assessment', sourceId: assessment._id, workflowKey: 'professional_assessment:advisor_review' } },
      { upsert: true },
    );
    } catch (error) {
      if (error.code !== 11000 || !(await FollowUp.exists({ assessmentActionKey: `${assessment._id}:advisor_review` }))) throw error;
    }
  }
}

async function completeAdvisorReviewTask(assessmentId) {
  return FollowUp.updateMany(
    { ...require('./healthManagementRollout').patientFilter(), sourceType: 'professional_assessment', sourceId: assessmentId, workflowKey: 'professional_assessment:advisor_review', status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', executedContent: '健康顾问已完成终审，系统自动完成。' } },
  );
}

module.exports = { createReferralWorkbenchTask, completeReferralAndCreateAdvisorReview, ensureAdvisorReviewTask, completeAdvisorReviewTask, referralAssessmentSource, isAssessmentSourceCurrent };
