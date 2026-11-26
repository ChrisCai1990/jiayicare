const openStatuses = ['planned', 'in_progress', 'missed'];

function scheduledContact(task) {
  if (!openStatuses.includes(task?.status)) return null;
  return (task.progressRecords || []).slice().reverse().find(record => record.nextContactAt) || null;
}

function dueDate(task) {
  return scheduledContact(task)?.nextContactAt || task?.date;
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

module.exports = { dueDate, scheduledContact, workbenchDueExpression };
