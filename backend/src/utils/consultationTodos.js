const id = value => String(value?._id || value || '');
function consultationTodos(rows, staff) {
  return rows.flatMap(row => {
    const state = row.status === 'team_assignment' && row.initiationSource === 'staff' && row.managerId ? 'intake' : row.status;
    if (state === 'expert') {
      if (!row.patientId || row.patientId.isDeleted) return [];
      const supplements = (staff.role === 'superadmin' || id(row.advisorId) === id(staff)) ? (row.correspondence || []).filter(item => !item.answers?.length).map(item => ({
        id: `consultation_supplement_${id(row)}_${id(item)}`, type: 'expert_consultation_task', assignedTo: id(row.advisorId),
        label: '专家要求补充资料待回复', patientId: id(row.patientId), patientName: row.patientId.name || '客户', priority: 1,
        summary: item.question, createdAt: item.requestedAt, overdue: false, link: `/expert-consultations?caseId=${id(row)}`,
      })) : [];
      return supplements.concat((row.members || []).filter(member => !member.repliedAt && (staff.role === 'superadmin' || id(member.staffId) === id(staff))).map(member => ({
        id: `expert_consultation_${id(row)}_${id(member.staffId)}`, type: 'expert_consultation_task', assignedTo: id(member.staffId),
        label: member.changeRequests?.some(request => !request.resolvedAt) ? '专家回复被退回，请修订' : '专家转介信待查看与回复', patientId: id(row.patientId), patientName: row.patientId.name || '客户', priority: 1,
        summary: `${row.type === 'mdt' ? 'MDT' : '单次专家咨询'} · ${member.startAt ? new Date(member.startAt).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai',hour12:false}) : '待安排时间'}`,
        createdAt: member.dispatchedAt || row.updatedAt || row.createdAt, overdue: false, link: `/expert-consultations?caseId=${id(row)}`,
      })));
    }
    const stages = {
      team_assignment: ['plannerId', '咨询首次派单'], intake: ['managerId', '咨询资料待收集'],
      advisor: ['advisorId', '转介信及专家待确认'],
      planner: row.expertsConfirmedAt ? ['managerId', '专家时间待预约'] : ['advisorId', '转介专家待确认'],
      reconcile: ['advisorId', '专家意见与随访计划待审核'], followup: ['managerId', '咨询随访计划待拟定'], final_review: ['advisorId', '咨询随访计划待审核'],
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
