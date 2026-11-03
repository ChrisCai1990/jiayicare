const FollowUp = require('../models/FollowUp');
const User = require('../models/User');

// 旧版把点击生成的顾问写入执行人。只纠正尚未开始、仍指向该会员所属顾问的配取任务。
async function reconcileSupplyReminderAssignees(models = { FollowUp, User }) {
  const tasks = await models.FollowUp.find({
    sourceType: 'supply_reminder', status: { $in: ['planned', 'missed'] }, assignedTo: { $ne: null },
  }).select('_id patientId assignedTo status').lean();
  if (!tasks.length) return 0;
  const patients = await models.User.find({ _id: { $in: [...new Set(tasks.map(task => String(task.patientId)))] } })
    .select('_id assignedFamilyDoctor assignedHealthManager').lean();
  const byPatient = new Map(patients.map(patient => [String(patient._id), patient]));
  let corrected = 0;
  for (const task of tasks) {
    const patient = byPatient.get(String(task.patientId));
    if (!patient?.assignedHealthManager || String(task.assignedTo) !== String(patient.assignedFamilyDoctor || '')) continue;
    if (String(task.assignedTo) === String(patient.assignedHealthManager)) continue;
    const result = await models.FollowUp.updateOne({
      _id: task._id, patientId: task.patientId, sourceType: 'supply_reminder',
      status: task.status, assignedTo: task.assignedTo,
    }, { $set: { assignedTo: patient.assignedHealthManager } });
    corrected += result.modifiedCount || 0;
  }
  return corrected;
}

module.exports = { reconcileSupplyReminderAssignees };
