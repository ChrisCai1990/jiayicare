const id = value => String(value?._id || value || '');
function consultationTodos(rows, staff) {
  return rows.flatMap(row => {
    const state = row.status === 'team_assignment' && row.initiationSource === 'staff' && row.managerId ? 'intake' : row.status;
    const stages = {
      team_assignment: ['plannerId', '咨询首次派单'], intake: ['managerId', '咨询资料待收集'],
      advisor: ['advisorId', '转介信及专家待确认'],
      planner: row.expertsConfirmedAt ? ['managerId', '专家时间待预约'] : ['advisorId', '转介专家待确认'],
      reconcile: ['advisorId', '专家意见待协调'], followup: ['managerId', '咨询随访计划待拟定'], final_review: ['advisorId', '咨询随访计划待审核'],
    };
    const stage = stages[state];
    if (!stage || !row.patientId || row.patientId.isDeleted) return [];
    const assignedTo = id(row[stage[0]]);
    if (staff.role !== 'superadmin' && assignedTo !== id(staff)) return [];
    return [{ id: `expert_consultation_${id(row)}`, type: 'expert_consultation_task', assignedTo,
      label: stage[1], patientId: id(row.patientId), patientName: row.patientId.name || '客户', priority: 2,
      summary: `${row.type === 'mdt' ? 'MDT 多学科咨询' : '单次专家咨询'} · ${row.clientRequest || ''}`,
      createdAt: row.updatedAt || row.createdAt, overdue: false,
      link: `/expert-consultations?caseId=${id(row)}` }];
  });
}
module.exports = { consultationTodos };
