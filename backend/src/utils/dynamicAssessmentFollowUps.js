const { dynamicFollowUpEligibility } = require('./dynamicFollowUpEligibility');
const { validateAssessmentFollowUpDrafts } = require('./assessmentFollowUpDrafts');

async function publishAssessmentFollowUps(assessment, advisor, models = {}) {
  if (assessment.status !== 'approved') throw new Error('评估尚未经健康顾问终审，不能发布随访');
  const drafts = validateAssessmentFollowUpDrafts(assessment.followUpDrafts || []);
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
    const coordinationGroupId = `professional-assessment:${assessment._id}:${index}`;
    const result = await insertTask(key, {
        patientId: patient._id, staffId: advisor._id, assignedTo: patient.assignedHealthManager,
        date: new Date(`${draft.date}T09:00:00+08:00`), remindAt: new Date(`${draft.date}T09:00:00+08:00`), type: 'other', status: 'planned',
        theme: draft.title, content: draft.content, plannedContent: draft.content,
        tags: ['动态随访', '专业健康评估'], sourceType: 'professional_assessment', sourceId: assessment._id, sourceScheduleKey: key,
        coordinationGroupId, taskRole: '', workflowKey: 'professional_assessment:dynamic_followup',
        aiStatus: 'approved', reviewRole: null, formData: { assessmentId: assessment._id, category: draft.category, requiresService: draft.requiresService === true, approvedBy: assessment.advisorReviewedBy || advisor._id },
    });
    created += result.upsertedCount || 0;
    if (draft.requiresService === true && patient.assignedHealthPlanner) {
      const serviceResult = await insertTask(`service:${key}`, {
          patientId: patient._id, staffId: advisor._id, assignedTo: patient.assignedHealthPlanner,
          date: new Date(`${draft.date}T09:00:00+08:00`), remindAt: new Date(`${draft.date}T09:00:00+08:00`), type: 'other', status: 'planned',
          theme: `服务需求待安排 · ${draft.title}`, content: draft.content, plannedContent: `${draft.content}\n处理要求：核对客户需求后关联现有服务流程；只有流程到达对应岗位时才生成其执行任务。`,
          tags: ['动态随访', '服务落地'], taskRole: 'supervisor', workflowKey: 'professional_assessment:service_request',
          coordinationGroupId, sourceType: 'professional_assessment', sourceId: assessment._id, sourceScheduleKey: `service:${key}`,
          aiStatus: 'approved', reviewRole: null, formData: { assessmentId: assessment._id, category: draft.category, serviceRequest: true, linkedFollowUpActionKey: `${assessment._id}:${key}`, approvedBy: assessment.advisorReviewedBy || advisor._id },
      });
      created += serviceResult.upsertedCount || 0;
    }
  }
  return { created, warnings: [] };
}

module.exports = { publishAssessmentFollowUps };
