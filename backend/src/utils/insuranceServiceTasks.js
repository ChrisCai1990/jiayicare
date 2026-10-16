const ACTIVE_STATUSES = ['planned', 'in_progress', 'missed'];

const hasExecution = task => Boolean(
  String(task.executedContent || '').trim()
  || (task.serviceChecklist || []).some(item =>
    item.executionStatus || item.executionResult || item.nextAction
    || item.supervisionStatus || item.supervisionNote)
);

async function retireInsuranceSupervisionTasks(FollowUp, scope = {}) {
  return FollowUp.updateMany(
    { ...scope, sourceType: 'insurance_service', taskRole: 'supervisor', status: { $in: ACTIVE_STATUSES } },
    { $set: { status: 'cancelled', cancelReason: '高端险事务由执行记录直接闭环，不再需要二次督办', completedAt: null, completedBy: null } },
  );
}

async function closeInsuranceCaseFromExecution(InsuranceServiceCase, task, actorName = '', actorId = null) {
  if (task.sourceType !== 'insurance_service' || task.taskRole !== 'executor' || task.status !== 'completed') return false;
  const checklist = Array.isArray(task.serviceChecklist) ? task.serviceChecklist : [];
  const serviceCase = await InsuranceServiceCase.findById(task.sourceId);
  if (!serviceCase || String(serviceCase.patientId) !== String(task.patientId)
    || !serviceCase.steps.length || serviceCase.steps.length !== checklist.length
    || serviceCase.steps.some((step, index) => step.title !== checklist[index]?.purpose
      || checklist[index]?.executionStatus !== 'completed' || !String(checklist[index]?.executionResult || '').trim())) return false;
  if (serviceCase.status === 'closed' && serviceCase.steps.every(step => step.status === 'completed')) return true;
  serviceCase.steps.forEach((step, index) => {
    if (step.status === 'completed') return;
    step.status = 'completed';
    step.note = step.note || checklist[index].executionResult.trim();
    step.completedAt = task.completedAt || new Date();
    step.completedByName = actorName || step.completedByName;
  });
  serviceCase.status = 'closed';
  if (actorId) serviceCase.updatedBy = actorId;
  await serviceCase.save();
  return true;
}

async function retireSupersededTasks(FollowUp, completed) {
  const sourceTypes = [{ sourceType: 'insurance_service', taskRole: completed.taskRole }];
  if (completed.taskRole === 'executor') sourceTypes.push(
    { sourceType: 'insurance_case', taskRole: { $ne: 'supervisor' } },
    { sourceType: 'scheduled', tags: '保险服务', taskRole: { $ne: 'supervisor' } },
  );
  const active = await FollowUp.find({ sourceId: completed.sourceId, status: { $in: ACTIVE_STATUSES }, $or: sourceTypes })
    .select('_id status createdAt executedContent serviceChecklist').lean();
  const duplicateIds = active.filter(task => {
    const supersededByCompletion = completed.completedAt && task.createdAt
      && new Date(task.createdAt) <= new Date(completed.completedAt);
    return supersededByCompletion || !hasExecution(task);
  }).map(task => task._id);
  if (duplicateIds.length) await FollowUp.updateMany(
    { _id: { $in: duplicateIds }, status: { $in: ACTIVE_STATUSES } },
    { $set: { status: 'cancelled', cancelReason: '同一保险案件的后续执行任务已完成，原待办不再需要处理', completedAt: null, completedBy: null } },
  );
}

async function reconcilePatientInsuranceTasks(FollowUp, InsuranceServiceCase, patientId) {
  await retireInsuranceSupervisionTasks(FollowUp, { patientId });
  const completedTasks = await FollowUp.find({ patientId, sourceType: 'insurance_service', sourceId: { $exists: true, $ne: null }, taskRole: 'executor', status: 'completed' })
    .select('_id patientId sourceType sourceId taskRole status serviceChecklist completedAt').lean();
  await Promise.all(completedTasks.map(async task => {
    await retireSupersededTasks(FollowUp, task);
    await closeInsuranceCaseFromExecution(InsuranceServiceCase, task);
  }));
}

async function ensureInsuranceServiceTask(FollowUp, serviceCase, taskRole, assignee, definition) {
  if (taskRole === 'supervisor') return null;
  if (!assignee) return null;
  const identity = { sourceType: 'insurance_service', sourceId: serviceCase._id, taskRole };
  const completed = await FollowUp.findOne({ ...identity, status: 'completed' }).select('_id sourceId taskRole completedAt').lean();
  if (completed) {
    // An earlier version recreated an active task every time a completed case was loaded.
    // Retire older superseded tasks and untouched duplicates; preserve later work for review.
    await retireSupersededTasks(FollowUp, completed);
    return completed;
  }
  return FollowUp.findOneAndUpdate(
    { ...identity, status: { $in: ACTIVE_STATUSES } },
    { $set: { staffId: assignee, assignedTo: assignee }, $setOnInsert: { ...definition, status: 'planned' } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

module.exports = { ensureInsuranceServiceTask, reconcilePatientInsuranceTasks, retireInsuranceSupervisionTasks, closeInsuranceCaseFromExecution };
