const { dynamicFollowUpEligibility } = require('./dynamicFollowUpEligibility');
const { validateAssessmentFollowUpDrafts } = require('./assessmentFollowUpDrafts');

async function publishAssessmentFollowUps(assessment, advisor, models = {}, source = {}) {
  require('./healthManagementRollout').assertPatientEnabled(assessment.patientId);
  const sourceType = source.type || 'professional_assessment';
  const sourceLabel = source.label || '专业健康评估';
  const contextIdField = source.contextIdField || 'assessmentId';
  if (assessment.status !== 'approved') throw new Error('评估尚未经健康顾问终审，不能发布随访');
  // Older approved report drafts have no visitPlan. Keep their retry path intact.
  const drafts = validateAssessmentFollowUpDrafts(assessment.followUpDrafts || [], {
    structuredVisit: sourceType === 'report_followup' && (assessment.followUpDrafts || []).some(item => item.visitPlan),
  });
  if (!drafts.length) return { created: 0, warnings: [] };
  const FollowUp = models.FollowUp || require('../models/FollowUp');
  const User = models.User || require('../models/User');
  const patient = await User.findById(assessment.patientId?._id || assessment.patientId).select('assignedHealthManager assignedHealthPlanner').lean();
  if (!patient?.assignedHealthManager) throw new Error('客户尚未绑定健管专员，请分配后重试发布');
  if (drafts.some(item => item.requiresService) && !patient.assignedHealthPlanner) throw new Error('客户尚未绑定健康规划师，请分配后重试发布');
  const eligibility = dynamicFollowUpEligibility({ patientId: patient._id, sourceId: assessment._id });
  if (!eligibility.eligible) throw new Error('随访缺少有效来源，无法发布');
  // 每条任务单独幂等：不能因已写入第一条就跳过整个批次，否则失败重试会漏任务。
  async function insertTask(key, values) {
    const assessmentActionKey = `${assessment._id}:${key}`;
    try {
      return await FollowUp.updateOne({ assessmentActionKey }, { $setOnInsert: { ...values, assessmentActionKey } }, { upsert: true, runValidators: true });
    } catch (error) {
      // 并行请求可能同时插入同一键；仅在该键已存在时视为成功。
      if (error.code === 11000 && await FollowUp.exists({ assessmentActionKey })) return { upsertedCount: 0 };
      throw error;
    }
  }
  let created = 0;
  for (const [index, draft] of drafts.entries()) {
    const key = `dynamic:${index}:${draft.date}`;
    const coordinationGroupId = `${source.groupPrefix || 'professional-assessment'}:${assessment._id}:${index}`;
    const visit = sourceType === 'report_followup' ? draft.visitPlan : null;
    const visitText = visit ? [
      draft.content, `建议就医/检查日期：${draft.date}`, `医院：${visit.hospital}`, `院区：${visit.campus}`,
      `科室：${visit.department}`, `专家：${visit.expert}`, visit.reason && `原因：${visit.reason}`,
      visit.notes && `注意事项：${visit.notes}`,
    ].filter(Boolean).join('\n') : draft.content;
    const bookingRequest = visit && (visit.bookingRequired || visit.serviceMode !== 'reminder') ? {
      required: true, hospital: visit.hospital, campus: visit.campus, department: visit.department,
      expert: visit.expert, items: draft.title, experts: [],
    } : null;
    const result = await insertTask(key, {
        patientId: patient._id, staffId: advisor._id, assignedTo: patient.assignedHealthManager,
        date: new Date(`${draft.date}T09:00:00+08:00`), remindAt: new Date(`${draft.date}T09:00:00+08:00`), type: 'other', status: 'planned',
        theme: draft.title, content: visitText, plannedContent: visitText,
        tags: ['动态随访', sourceLabel], sourceType, sourceId: assessment._id, sourceScheduleKey: key,
        coordinationGroupId, taskRole: '', workflowKey: `${sourceType}:dynamic_followup`,
        aiStatus: 'approved', reviewRole: null, deliveryMode: visit?.serviceMode || 'reminder', deliveryType: visit?.serviceType || '',
        formData: { [contextIdField]: assessment._id, category: draft.category, requiresService: draft.requiresService === true,
          ...(bookingRequest ? { bookingRequest } : {}), approvedBy: assessment.advisorReviewedBy || advisor._id },
    });
    created += result.upsertedCount || 0;
    if (draft.requiresService === true && patient.assignedHealthPlanner) {
      const serviceResult = await insertTask(`service:${key}`, {
          patientId: patient._id, staffId: advisor._id, assignedTo: patient.assignedHealthPlanner,
          date: new Date(`${draft.date}T09:00:00+08:00`), remindAt: new Date(`${draft.date}T09:00:00+08:00`), type: 'other', status: 'planned',
          theme: `服务需求待安排 · ${draft.title}`, content: visitText,
          plannedContent: `${visitText}\n处理要求：健康规划师按本次安排协调服务；预约由健管专员确认，就医协助交由对应执行岗位。`,
          tags: ['动态随访', '服务落地'], taskRole: 'supervisor', workflowKey: `${sourceType}:service_request`,
          coordinationGroupId, sourceType, sourceId: assessment._id, sourceScheduleKey: `service:${key}`,
          aiStatus: 'approved', reviewRole: null, deliveryMode: visit?.serviceMode || 'reminder', deliveryType: visit?.serviceType || '',
          formData: { [contextIdField]: assessment._id, category: draft.category,
            serviceRequest: visit ? { moduleKey: draft.category === 'examination' ? 'abnormal_followup' : 'medical_treatment',
              mode: visit.serviceMode, serviceType: visit.serviceType, itemSnapshot: { ...visit, items: draft.title } } : true,
            linkedFollowUpActionKey: `${assessment._id}:${key}`, approvedBy: assessment.advisorReviewedBy || advisor._id },
      });
      created += serviceResult.upsertedCount || 0;
    }
  }
  return { created, warnings: [] };
}

const publishReportFollowUps = (draft, advisor, models) => publishAssessmentFollowUps(draft, advisor, models, { type: 'report_followup', label: '病历/报告', groupPrefix: 'report-followup', contextIdField: 'reportDraftId' });
module.exports = { publishAssessmentFollowUps, publishReportFollowUps };
