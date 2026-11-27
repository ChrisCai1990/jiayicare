const text = value => String(value || '').trim();

function bookingRequirements(task) {
  const plan = require('./annualBookingPlan.cjs').bookingPlan(task);
  const lines = plan.text.split(/\r?\n/).map(text).filter(Boolean);
  const field = label => lines.find(line => line.startsWith(`${label}：`))?.slice(label.length + 1).trim() || '';
  const timing = field('预约安排日期');
  const itemsLine = field('同次就诊事项');
  const titles = itemsLine ? itemsLine.split('；').map(text).filter(Boolean) : [];
  const visitItems = titles.map((label, index) => {
    const [title, ...fields] = label.split(/ · (?=(?:就诊科室|开单科室|检查科室)：)/);
    const departmentField = name => fields.find(part => part.startsWith(name + '：'))?.slice(name.length + 1) || '';
    const orderDepartment = departmentField('开单科室'), examDepartment = departmentField('检查科室');
    const detail = lines.find(line => line.startsWith(`${title}：`))?.slice(title.length + 1).trim() || '';
    const parts = detail.split(/；(?=科室|专家|原因)/).map(text);
    const get = label => parts.find(part => part.startsWith(label))?.slice(label.length).trim() || '';
    const primary = title === plan.items || (!detail && index === 0);
    return { moduleKey: examDepartment ? 'abnormal_followup' : 'item', recordIndex: index, title, primary, orderDepartment, examDepartment, department: examDepartment || departmentField('就诊科室') || get('科室') || (primary ? plan.department : ''),
      expert: get('专家') || (primary ? plan.expert : ''),
      reason: get('原因') || (primary ? plan.reason : '') };
  });
  return {
    plan,
    appointmentDate: timing.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '',
    timingNote: timing.replace(/^\d{4}-\d{2}-\d{2}；?\s*/, ''),
    goal: field('管理目标'),
    frequency: field('执行频次'),
    precautions: field('注意事项') || plan.precautions,
    visitItems,
  };
}

module.exports = { bookingRequirements };
