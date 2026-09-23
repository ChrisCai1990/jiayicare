function bookingPlan(task) {
  const text = String(task.plannedContent || task.content || '');
  const lines = text.split(/\r?\n/);
  const get = labels => {
    for (const label of labels) {
      const line = lines.find(line => line.trim().startsWith(`${label}：`));
      if (line) return line.trim().slice(label.length + 1).trim();
    }
    return '';
  };
  const clean = value => ['无', '未定', '待定', '待确认', '未填写', '-'].includes(value) ? '' : value;
  return { hospital: clean(get(['就医/会诊医院', '复查医院', '计划体检机构', '医院'])),
    department: clean(get(['科室', '检查科室'])), expert: clean(get(['专家', '检查专家'])),
    orderDepartment: get(['开单科室']), items: get(['项目', '待完善项目', '重点关注']) || task.theme || '',
    reason: get(['原因', '完善依据']), precautions: get(['注意事项']),
    suggestedDate: text.match(/建议(?:就医\/检查|体检)日期：\s*(\d{4}-\d{2}-\d{2})/)?.[1] || '', text };
}
function advisorOwned(task) { return task?.sourceType === 'scheduled' && !!task.sourceAnnualPlanId; }
function canEditPlan(task, role) { return !advisorOwned(task) || ['familyDoctor', 'superadmin'].includes(role); }
function protectedEdit(task, role, body) {
  return !canEditPlan(task, role) && (['date', 'theme', 'content', 'plannedContent', 'assignedTo', 'type', 'sourceAnnualPlanId', 'sourceScheduleKey', 'deliveryMode', 'deliveryType'].some(key => Object.hasOwn(body, key)) || body.status === 'cancelled');
}
module.exports = { bookingPlan, advisorOwned, canEditPlan, protectedEdit };
