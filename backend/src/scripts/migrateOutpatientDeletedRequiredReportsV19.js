require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const User = require('../models/User');
const MedicalReport = require('../models/MedicalReport');
const MedicalReportDeletionLog = require('../models/MedicalReportDeletionLog');

const REQUIRED = ['prescription_order', 'outpatient_record'];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const advisorTasks = await FollowUp.find({
    sourceType: 'health_plan', taskRole: 'executor', workflowKey: 'system:outpatient_post_visit_review',
    status: { $in: ['planned', 'in_progress'] }, isBlocked: true,
  }).lean();
  let placeholdersRestored = 0;
  let auditTasksReopened = 0;
  for (const advisorTask of advisorTasks) {
    const planId = advisorTask.sourceHealthPlanId;
    if (!planId) continue;
    const existing = await MedicalReport.find({ sourceHealthPlanId: planId, documentCategory: { $in: REQUIRED } }).select('_id documentCategory user uploadedBy').lean();
    const categories = new Set(existing.map(item => item.documentCategory));
    for (const category of REQUIRED.filter(item => !categories.has(item))) {
      const deletion = await MedicalReportDeletionLog.findOne({
        patientId: advisorTask.patientId,
        'snapshot.sourceHealthPlanId': planId,
        'snapshot.documentCategory': category,
      }).sort({ createdAt: -1 }).lean();
      if (!deletion?.snapshot) continue;
      const snapshot = deletion.snapshot;
      const alreadyRestored = await MedicalReport.exists({ _id: deletion.reportId });
      if (alreadyRestored) continue;
      await MedicalReport.create({
        _id: deletion.reportId, user: snapshot.user || advisorTask.patientId, tenantId: snapshot.tenantId || null,
        title: snapshot.title || (category === 'outpatient_record' ? '门诊一站式·当日门诊病历' : '门诊一站式·当日检验检查单'),
        type: snapshot.type || 'other', documentCategory: category, hospital: snapshot.hospital || '',
        date: snapshot.date || '', checkDate: snapshot.checkDate || snapshot.date || '', reportYear: snapshot.reportYear || null,
        uploadedBy: snapshot.uploadedBy || null, uploadedByRole: snapshot.uploadedByRole || '', sourceType: 'health_plan',
        sourceHealthPlanId: planId, planId, audit_status: 'unaudited', aiStatus: 'pending', status: 'pending',
        fileUrl: '', fileUrls: [], ossKey: '', ossKeys: [], content: '', mimeType: '', fileSize: '', reportItems: [],
      });
      placeholdersRestored += 1;
    }
    const reports = await MedicalReport.find({ sourceHealthPlanId: planId, documentCategory: { $in: REQUIRED } }).select('_id documentCategory uploadedBy').lean();
    if (!REQUIRED.every(category => reports.some(item => item.documentCategory === category))) continue;
    const patient = await User.findById(advisorTask.patientId).select('assignedHealthManager').lean();
    const auditTask = await FollowUp.findOneAndUpdate(
      { sourceHealthPlanId: planId, sourceType: 'health_plan', taskRole: 'executor', workflowKey: 'system:outpatient_report_audit' },
      { $set: {
        assignedTo: patient?.assignedHealthManager || reports.find(item => item.uploadedBy)?.uploadedBy,
        status: 'planned', completedAt: null, completedBy: null, isBlocked: false, activationEvent: '',
        date: new Date(), remindAt: new Date(), nextFollowUpDate: new Date(),
        content: '必需资料曾被删除，请补传文件并重新完成审核。',
        formData: { reportIds: reports.map(item => item._id) },
      } },
      { new: true }
    );
    if (!auditTask) continue;
    await FollowUp.collection.updateOne(
      { _id: advisorTask._id },
      { $set: { isBlocked: true, activationEvent: 'outpatient_reports_audited', dependsOnTaskId: auditTask._id, formData: { reportIds: reports.map(item => item._id) } } }
    );
    auditTasksReopened += 1;
  }
  console.log(JSON.stringify({ placeholdersRestored, auditTasksReopened }, null, 2));
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
