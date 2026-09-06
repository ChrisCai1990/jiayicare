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
    const collectionName = isCheckupService ? '体检报告回收' : '就医资料回收';
    const collectionContent = isCheckupService
      ? '体检完成后跟进报告出具进度，回收并核对报告资料；上传后进入独立的报告解析与专业审核流程。'
      : '就医完成后回收并核对就诊记录、检查检验结果、处方医嘱及费用凭证，归档后安排后续跟进。';
    const result = await FollowUp.updateOne({ _id: row._id }, { $set: {
      workflowKey: 'system:document_collection',
      theme: `督办【${collectionName}】 · ${plan.title || ''}`,
      content: collectionContent,
    } });
    updated += result.modifiedCount || 0;
  }
  return updated;
}

module.exports = { reconcileMedicalAssistDocumentCollectionTasks };
