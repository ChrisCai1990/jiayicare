// 只修正尚未执行的年度普通提醒。标题相同不是岗位归属证据。
function annualReminderAssignmentFilter() {
  return {
    sourceType: 'scheduled', sourceAnnualPlanId: { $ne: null },
    status: { $in: ['planned', 'missed'] }, theme: { $regex: /就医提醒|年度体检/ },
    taskRole: { $in: ['', null] }, workflowKey: { $in: ['', null] },
    sourceHealthPlanId: null, sourceOrderId: null, 'serviceTracking.linkId': null, isBlocked: { $ne: true },
  };
}

async function reconcileAnnualReminderAssignments({ FollowUp, User }) {
  const filter = annualReminderAssignmentFilter();
  const rows = await FollowUp.find(filter).select('patientId assignedTo status');
  let updated = 0;
  for (const row of rows) {
    const patient = await User.findById(row.patientId).select('assignedHealthManager').lean();
    if (!patient?.assignedHealthManager || String(row.assignedTo || '') === String(patient.assignedHealthManager)) continue;
    // 读取后已开始/关联服务/人工改派的记录不覆盖；不重开已完成、已取消历史。
    const result = await FollowUp.updateOne({
      ...filter, _id: row._id, assignedTo: row.assignedTo || null, status: row.status,
    }, { $set: { assignedTo: patient.assignedHealthManager } });
    updated += result.modifiedCount || 0;
  }
  return updated;
}

module.exports = { annualReminderAssignmentFilter, reconcileAnnualReminderAssignments };
