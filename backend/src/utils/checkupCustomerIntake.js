const id = value => String(value?._id || value || '');
async function customerIntakeError(service, models) {
  const c = service.content || {};
  const ids = (c.followUpPlans?.length ? c.followUpPlans.map(x => x.id || x._id) : [c.followUpPlanId]).filter(Boolean);
  const customer = await models.FollowUpPlan.exists({ _id: { $in: ids }, executorRole: 'customer' });
  const questionnaireId = c.serviceWorkflowSnapshot?.questionnaireId;
  if (!customer && !questionnaireId) return '';
  if (!questionnaireId) return '客户健康文件节点尚未绑定问卷，请管理员完善服务配置';
  const intake = c.checkupIntake;
  if (intake?.status !== 'submitted' || !intake.responseId || !intake.assignmentId || id(intake.questionnaireId) !== id(questionnaireId)) return '请等待客户完成本次服务健康文件，不能由员工任务代替';
  const assignment = await models.PushRecord.findOne({ _id: intake.assignmentId, patientId: service.patientId, type: 'questionnaire', questionnaireId }).lean();
  if (!assignment || (!assignment.sourceHealthPlanId && !assignment.sourceOrderId)
    || (assignment.sourceHealthPlanId && id(assignment.sourceHealthPlanId) !== id(service._id))
    || (assignment.sourceOrderId && id(assignment.sourceOrderId) !== id(service.sourceOrderId))) return '健康文件分配记录与本次服务不符';
  const response = await models.QuestionnaireResponse.findOne({ _id: intake.responseId, user: service.patientId, questionnaire: questionnaireId, pushRecordId: intake.assignmentId }).lean();
  if (!response?.submittedAt) return '本次健康文件提交凭据缺失，请核对原问卷';
  return '';
}
function runtimeError(service) {
  return customerIntakeError(service, {
    FollowUpPlan: require('../models/FollowUpPlan'), PushRecord: require('../models/PushRecord'),
    QuestionnaireResponse: require('../models/DynamicQuestionnaire').QuestionnaireResponse,
  });
}
module.exports = { customerIntakeError, runtimeError };
