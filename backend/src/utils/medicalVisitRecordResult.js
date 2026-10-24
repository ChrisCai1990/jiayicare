const value = input => String(input || '').trim();

function taskResult(task) {
  const data = task.formData || {};
  const lines = [];
  for (const [label, field] of [
    ['代诊结果及医嘱', 'proxyVisitResult'],
    ['实际开具的检查', 'examOrderSummary'],
    ['陪诊检查过程', 'inspectionProcess'],
    ['特殊情况及处理', 'specialSituations'],
    ['专家看诊及医嘱', 'expertVisitSummary'],
  ]) {
    if (value(data[field])) lines.push(`${label}：${value(data[field])}`);
  }
  if ((value(data.proxyVisitResult) || value(data.examOrderSummary)) && Array.isArray(data.checkAppointments)) {
    data.checkAppointments.forEach((item, index) => {
      const detail = [item.item, item.department, item.location, item.appointmentDate, item.appointmentTime].map(value).filter(Boolean).join(' · ');
      if (detail) lines.push(`检查预约${index + 1}：${detail}`);
    });
  }
  if (Array.isArray(task.serviceChecklist)) {
    task.serviceChecklist.forEach((item, index) => {
      if (!value(item.executionResult) && !value(item.nextAction)) return;
      const status = { completed: '已完成', partial: '部分完成', incomplete: '未完成' }[item.executionStatus] || '未标记';
      lines.push(`${index + 1}. ${value(item.purpose) || '代办事项'}：${status}${value(item.executionResult) ? `；结果：${value(item.executionResult)}` : ''}${value(item.nextAction) ? `；下一步：${value(item.nextAction)}` : ''}`);
    });
  }
  if (lines.length) return lines.join('\n');
  // Older tasks only stored the specialist's free text.
  if (/代办|代诊|陪诊|陪同就医|就医专员/.test(task.theme || '') && !/预约|审核|规划|分配/.test(task.theme || '')) {
    return value(task.executedContent || task.content);
  }
  return '';
}

function summarizeMedicalVisitTasks(tasks) {
  return tasks.filter(task => task.status === 'completed' && task.taskRole !== 'supervisor')
    .map(task => ({ task, result: taskResult(task) })).filter(item => item.result)
    .sort((a, b) => new Date(a.task.completedAt || a.task.date || 0) - new Date(b.task.completedAt || b.task.date || 0))
    .map(({ task, result }) => `${value(task.theme) || '就医协助'}\n${result}`).join('\n\n');
}

module.exports = { taskResult, summarizeMedicalVisitTasks };
