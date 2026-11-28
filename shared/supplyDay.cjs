const { dueDate, dayKey } = require('./followUpDue.cjs');

function isSupply(task) {
  return task.sourceType === 'supply_reminder' || task.formData?.adHocMedicalReminder === true && task.formData.reminderKind === 'medication';
}
function dayOf(task) {
  const last = (task.progressRecords || []).slice().reverse().find(row => row.nextContactAt);
  const date = last?.nextContactAt || dueDate(task);
  return date && Number.isFinite(+new Date(date)) ? dayKey(date) : '';
}
function keyOf(task) {
  const patient = task.patientId?._id || task.patientId;
  const day = isSupply(task) && dayOf(task);
  return patient && day && task.status !== 'cancelled' ? String(patient) + '/' + day : '';
}
function summary(task) {
  const content = task.plannedContent || task.taskRequirements || task.content || '';
  const name = task.formData?.supplyName || content.match(/(?:药物|营养素)「([^」]+)」/)?.[1]
    || content.match(/药品名称[：:]([^\n]+)/)?.[1] || (task.theme || '配取事项').replace(/^(我方代配|就医配取提醒|提醒客户配取)\s*·\s*/, '');
  return { id: String(task._id), name, quantity: task.formData?.quantity || content.match(/本次数量[：:]([^，。\n]+)/)?.[1] || '',
    kind: task.tags?.includes('营养素') || task.formData?.supplyKind === 'supplement' ? '营养素' : '药品',
    done: task.status === 'completed' };
}
function cards(tasks) {
  const rows = [], groups = new Map();
  for (const task of tasks) {
    const key = keyOf(task);
    if (!key) { rows.push(task); continue; }
    if (!groups.has(key)) {
      const group = { supplyKey: key, day: dayOf(task), items: [] };
      rows.push(group); groups.set(key, group);
    }
    groups.get(key).items.push(task);
  }
  return rows;
}
module.exports = { isSupply, dayOf, keyOf, summary, cards };
