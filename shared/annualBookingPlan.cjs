function bookingPlan(task) {
  const text = String(task.plannedContent || task.content || '');
  const lines = text.split(/\r?\n/);
  const get = labels => {
    for (const label of labels) {
      const line = lines.find(line => line.trim().startsWith(`${label}：`));
      if (line) {
        const start = lines.indexOf(line), values = [line.trim().slice(label.length + 1).trim()];
        if (['项目', '待完善项目', '重点关注'].includes(label)) {
          for (let i = start + 1; i < lines.length && !/^[^：:]{1,20}[：:]/.test(lines[i].trim()); i++) values.push(lines[i].trim());
        }
        return values.join('\n').trim();
      }
    }
    return '';
  };
  const clean = value => ['无', '未定', '待定', '待确认', '未填写', '-'].includes(value) ? '' : value;
  return { hospital: clean(get(['就医/会诊医院', '复查医院', '计划体检机构', '医院'])),
    department: clean(get(['科室', '检查科室'])), expert: clean(get(['专家', '检查专家'])),
    examDepartment: clean(get(['检查科室', '科室'])), examExpert: clean(get(['检查专家', '专家'])),
    orderExpert: clean(get(['开单专家'])),
    orderDepartment: get(['开单科室']), items: get(['项目', '待完善项目', '重点关注']) || task.theme || '',
    reason: get(['原因', '完善依据']), precautions: get(['注意事项']),
    suggestedDate: text.match(/建议(?:就医\/检查|体检)日期：\s*(\d{4}-\d{2}-\d{2})/)?.[1] || '', text };
}
function advisorOwned(task) { return task?.sourceType === 'scheduled' && !!task.sourceAnnualPlanId; }
function canEditPlan(task, role) { return !require('./annualDispatch.cjs').dedicated(task) && (!advisorOwned(task) || ['familyDoctor', 'superadmin'].includes(role)); }
function protectedEdit(task, role, body) {
  return !canEditPlan(task, role) && (['date', 'theme', 'content', 'plannedContent', 'assignedTo', 'type', 'sourceAnnualPlanId', 'sourceScheduleKey', 'deliveryMode', 'deliveryType'].some(key => Object.hasOwn(body, key)) || body.status === 'cancelled');
}
// Each slot retains its own department/expert. Never infer an examination department
// from the ordering department or split a clinical item on arbitrary punctuation.
function bookingSlots(task) {
  const p = bookingPlan(task);
  const exam = ['abnormal_followup', 'checkup_completion', 'annual_checkup', 'functional_medicine'].includes(String(task.sourceScheduleKey || '').split(':')[0]);
  const slots = [];
  if (exam && p.orderDepartment && p.orderDepartment !== '无') slots.push({ id: 'outpatient', type: 'outpatient', title: '开单门诊', hospital: p.hospital, department: p.orderDepartment, expert: p.orderExpert });
  const names = exam ? p.items.split(/[\r\n；;]+/).map(s => s.trim()).filter(Boolean) : [p.items];
  if (!names.length) names.push('检查预约');
  for (const [i, name] of names.entries()) slots.push({ id: `${exam ? 'exam' : 'outpatient'}-${i}`, type: exam ? 'exam' : 'outpatient', title: name || (exam ? '检查预约' : '就医预约'), hospital: p.hospital, department: exam ? p.examDepartment : p.department, expert: exam ? p.examExpert : p.expert });
  return slots;
}
function bookingReady(booking) { return ['booked', 'arranged'].includes(booking?.status); }
function pendingOnsite(booking) { return (booking?.entries || []).filter(e => e.mode === 'onsite' && e.status !== 'booked'); }
module.exports = { bookingPlan, bookingSlots, bookingReady, pendingOnsite, advisorOwned, canEditPlan, protectedEdit };
