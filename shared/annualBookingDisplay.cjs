const text = value => String(value || '').trim();

function bookingRequirements(task) {
  const plan = require('./annualBookingPlan.cjs').bookingPlan(task);
  const lines = plan.text.split(/\r?\n/).map(text).filter(Boolean);
  const field = label => lines.find(line => line.startsWith(`${label}：`))?.slice(label.length + 1).trim() || '';
  const timing = field('预约安排日期');
  const itemsLine = field('同次就诊事项');
  const titles = itemsLine ? itemsLine.split('；').map(text).filter(Boolean) : [];
  const visitItems = titles.map((title, index) => {
    const detail = lines.find(line => line.startsWith(`${title}：`))?.slice(title.length + 1).trim() || '';
    const parts = detail.split(/；(?=科室|专家|原因)/).map(text);
    const get = label => parts.find(part => part.startsWith(label))?.slice(label.length).trim() || '';
    const primary = title === plan.items || (!titles.includes(plan.items) && index === 0);
    return { moduleKey: 'item', recordIndex: index, title, department: get('科室') || (primary ? plan.department : ''),
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
