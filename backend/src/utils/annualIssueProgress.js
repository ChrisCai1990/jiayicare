const id = value => String(value?._id || value || '');

function sourceIds(task) {
  const direct = task.managementIssueIds || [];
  const snapshot = task.formData?.serviceRequest?.itemSnapshot?.sourceIds || [];
  const nutrition = (task.formData?.annualNutritionGoals || []).map(row => row.issueId);
  return [...new Set([...direct, ...snapshot, ...nutrition].map(String).filter(Boolean))];
}

function taskRow(task) {
  const latestProgress = (task.progressRecords || []).at(-1);
  return {
    id: id(task._id), theme: String(task.theme || '').slice(0, 120), status: task.status,
    role: task.assignedTo?.role || '', assignee: task.assignedTo?.name || '',
    plannedAt: task.date || null, completedAt: task.completedAt || null,
    latestProgress: latestProgress?.content ? String(latestProgress.content).slice(0, 500) : '',
    result: task.status === 'completed' ? String(task.executedContent || '').slice(0, 1000) : '',
    serviceStatus: task.serviceTracking?.status || '',
  };
}

function project(targets = [], tasks = []) {
  return targets.map(target => {
    const issueId = String(target.issueId || '');
    const linked = tasks.filter(task => issueId && sourceIds(task).includes(issueId));
    linked.sort((a, b) => {
      const active = row => ['planned', 'in_progress', 'missed'].includes(row.status) ? 0 : 1;
      return active(a) - active(b) || new Date(b.completedAt || b.date || 0) - new Date(a.completedAt || a.date || 0);
    });
    return { issueId, tasks: linked.slice(0, 12).map(taskRow), totalTasks: linked.length };
  });
}

module.exports = { sourceIds, project };
