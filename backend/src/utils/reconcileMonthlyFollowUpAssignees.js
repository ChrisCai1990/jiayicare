const FollowUp = require('../models/FollowUp');
const User = require('../models/User');

// 旧月度 AI 草稿曾把顾问放在执行人槽位，或只保存创建人。
// 只修正尚未开始的月度随访；其他任务及已执行记录保留原指派。
async function reconcileMonthlyFollowUpAssignees(models = { FollowUp, User }) {
  const tasks = await models.FollowUp.find({
    sourceType: 'ai_review', aiStatus: 'approved', status: { $in: ['planned', 'missed'] },
  }).select('_id patientId assignedTo status').lean();
  if (!tasks.length) return 0;
  const patients = await models.User.find({ _id: { $in: [...new Set(tasks.map(task => String(task.patientId)))] } })
    .select('_id assignedFamilyDoctor assignedHealthManager').lean();
  const byPatient = new Map(patients.map(patient => [String(patient._id), patient]));
  let corrected = 0;
  for (const task of tasks) {
    const patient = byPatient.get(String(task.patientId));
    if (!patient?.assignedHealthManager) continue;
    const current = String(task.assignedTo || '');
    if (current && current !== String(patient.assignedFamilyDoctor || '')) continue;
    const result = await models.FollowUp.updateOne({
      _id: task._id, patientId: task.patientId, sourceType: 'ai_review', aiStatus: 'approved',
      status: task.status, assignedTo: task.assignedTo || null,
    }, { $set: { assignedTo: patient.assignedHealthManager } });
    corrected += result.modifiedCount || 0;
  }
  return corrected;
}

module.exports = { reconcileMonthlyFollowUpAssignees };
