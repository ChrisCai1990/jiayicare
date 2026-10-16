const ACTIVE_STATUSES = ['planned', 'in_progress', 'missed'];

const hasExecution = task => Boolean(
  String(task.executedContent || '').trim()
  || (task.serviceChecklist || []).some(item =>
    item.executionStatus || item.executionResult || item.nextAction
    || item.supervisionStatus || item.supervisionNote)
);

async function retireUntouchedDuplicates(FollowUp, completed) {
  const identity = { sourceType: 'insurance_service', sourceId: completed.sourceId, taskRole: completed.taskRole };
  const active = await FollowUp.find({ ...identity, status: { $in: ACTIVE_STATUSES } })
    .select('_id status createdAt executedContent serviceChecklist').lean();
  const duplicateIds = active.filter(task =>
    (!completed.completedAt || new Date(task.createdAt) >= new Date(completed.completedAt))
    && !hasExecution(task)
  ).map(task => task._id);
  if (duplicateIds.length) await FollowUp.updateMany(
    { _id: { $in: duplicateIds }, status: { $in: ACTIVE_STATUSES } },
    { $set: { status: 'cancelled', cancelReason: '同一保险案件已有已完成任务，关闭自动生成的重复待办', completedAt: null, completedBy: null } },
  );
}

async function reconcilePatientInsuranceTasks(FollowUp, patientId) {
  const completedTasks = await FollowUp.find({ patientId, sourceType: 'insurance_service', sourceId: { $exists: true, $ne: null }, taskRole: { $in: ['executor', 'supervisor'] }, status: 'completed' })
    .select('_id sourceId taskRole completedAt').lean();
  await Promise.all(completedTasks.map(task => retireUntouchedDuplicates(FollowUp, task)));
}

async function ensureInsuranceServiceTask(FollowUp, serviceCase, taskRole, assignee, definition) {
  if (!assignee) return null;
  const identity = { sourceType: 'insurance_service', sourceId: serviceCase._id, taskRole };
  const completed = await FollowUp.findOne({ ...identity, status: 'completed' }).select('_id sourceId taskRole completedAt').lean();
  if (completed) {
    // An earlier version recreated an active task every time a completed case was loaded.
    // Retire only untouched duplicates; preserve any later work for human review.
    await retireUntouchedDuplicates(FollowUp, completed);
    return completed;
  }
  return FollowUp.findOneAndUpdate(
    { ...identity, status: { $in: ACTIVE_STATUSES } },
    { $set: { staffId: assignee, assignedTo: assignee }, $setOnInsert: { ...definition, status: 'planned' } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

module.exports = { ensureInsuranceServiceTask, reconcilePatientInsuranceTasks };
