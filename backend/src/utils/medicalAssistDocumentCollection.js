const FollowUp = require('../models/FollowUp');
const HealthPlan = require('../models/HealthPlan');

const CHECKUP_SERVICE_RE = /体检/;

async function reconcileMedicalAssistDocumentCollectionTasks() {
  const rows = await FollowUp.find({
    sourceType: 'health_plan',
    taskRole: 'supervisor',
    workflowKey: { $in: ['system:checkup_report_collection', 'system:medical_document_collection'] },
    status: { $in: ['planned', 'in_progress', 'missed'] },
  }).lean();
  let updated = 0;
  for (const row of rows) {
    const plan = await HealthPlan.findById(row.sourceHealthPlanId).select('title content type').lean();
    if (!plan || plan.type !== 'medical_assist') continue;
    const content = plan.content || {};
    const isCheckupService = content.serviceDomain === 'annual_checkup'
      || content.templateSnapshot?.serviceDomain === 'annual_checkup'
      || CHECKUP_SERVICE_RE.test(`${content.templateName || ''} ${plan.title || ''}`);
    const cancelReason = isCheckupService
      ? '流程标准化：体检报告回收由 Admin 岗位任务承接'
      : '流程标准化：开单阶段仅保留代办执行与督办，资料回收在实际就诊后另行触发';
    const result = await FollowUp.updateOne({ _id: row._id }, { $set: {
      workflowKey: 'system:document_collection',
      status: 'cancelled',
      cancelReason,
    } });
    updated += result.modifiedCount || 0;
  }
  return updated;
}

module.exports = { reconcileMedicalAssistDocumentCollectionTasks };
