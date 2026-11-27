const openStatuses = ['planned', 'in_progress', 'missed'];

function scheduledContact(task) {
  if (!openStatuses.includes(task?.status)) return null;
  return (task.progressRecords || []).slice().reverse().find(record => record.nextContactAt) || null;
}

function dueDate(task) {
  return scheduledContact(task)?.nextContactAt || task?.date;
}

const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' });
const dayKey = date => dayFormat.format(new Date(date));
const dayStart = date => new Date(dayKey(date) + 'T00:00:00+08:00');
function isOverdue(task, now = new Date()) {
  const date = dueDate(task);
  return openStatuses.includes(task?.status) && !!date && new Date(date) < dayStart(now);
}

function validPlanDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.+)?$/.test(value)) return false;
  const day = value.slice(0, 10);
  const parsed = new Date(day);
  return Number.isFinite(+parsed) && parsed.toISOString().startsWith(day) && Number.isFinite(Date.parse(value));
}

// Progress records are append-only. An entry without a date keeps the last arrangement.
function workbenchDueExpression() {
  return { $cond: [
    { $in: ['$status', openStatuses] },
    { $reduce: { input: { $ifNull: ['$progressRecords', []] }, initialValue: '$date',
      in: { $ifNull: ['$$this.nextContactAt', '$$value'] } } },
    '$date',
  ] };
}

module.exports = { dueDate, scheduledContact, workbenchDueExpression, isOverdue, dayKey, dayStart, validPlanDate, openStatuses };
