require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const MedicalReport = require('../models/MedicalReport');
const User = require('../models/User');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const advisorTasks = await FollowUp.find({
    sourceType: 'health_plan', taskRole: 'executor', status: 'planned',
    $or: [{ workflowKey: 'system:outpatient_post_visit_review' }, { theme: /门诊一站式.*查看陪诊资料并制定随访计划/ }],
  });
  let auditTasksCreated = 0;
  let advisorTasksUpdated = 0;
  for (const advisorTask of advisorTasks) {
    const reports = await MedicalReport.find({ sourceHealthPlanId: advisorTask.sourceHealthPlanId, $or: [
      { documentCategory: { $in: ['prescription_order', 'outpatient_record'] } },
      { title: { $in: ['门诊一站式·当日检验检查单', '门诊一站式·当日门诊病历'] } },
    ] }).select('_id audit_status');
    if (!reports.length) continue;
    const patient = await User.findById(advisorTask.patientId).select('assignedHealthManager').lean();
    const allAudited = reports.length >= 2 && reports.every(report => report.audit_status === 'audited');
    let auditTask = await FollowUp.findOne({ sourceHealthPlanId: advisorTask.sourceHealthPlanId, workflowKey: 'system:outpatient_report_audit' });
    if (!auditTask) {
      auditTask = await FollowUp.create({
        patientId: advisorTask.patientId, staffId: advisorTask.staffId, assignedTo: patient?.assignedHealthManager || advisorTask.staffId,
        date: new Date(), remindAt: new Date(), nextFollowUpDate: new Date(), type: 'other',
        status: allAudited ? 'completed' : 'planned', completedAt: allAudited ? new Date() : null, completedBy: allAudited ? 'staff' : null,
        content: allAudited ? '本次门诊病历和检验检查单已全部审核通过。' : '', plannedContent: '在报告管理中逐份审核本次门诊病历和检验检查单。',
        theme: '审核门诊一站式病历与检验检查单', coordinationGroupId: advisorTask.coordinationGroupId,
        taskRole: 'executor', workflowKey: 'system:outpatient_report_audit', dependsOnTaskId: advisorTask.dependsOnTaskId,
        isBlocked: false, activationEvent: '', sourceType: 'health_plan', sourceHealthPlanId: advisorTask.sourceHealthPlanId,
        formData: { reportIds: reports.map(report => report._id) },
      });
      auditTasksCreated += 1;
    }
    advisorTask.dependsOnTaskId = auditTask._id;
    advisorTask.isBlocked = !allAudited;
    advisorTask.activationEvent = allAudited ? '' : 'outpatient_reports_audited';
    await advisorTask.save();
    advisorTasksUpdated += 1;
  }
  console.log(JSON.stringify({ auditTasksCreated, advisorTasksUpdated }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
