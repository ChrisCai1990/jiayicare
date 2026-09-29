// Presentation only: combine the backend's explicit arrangement/upload pair.
// Ambiguous pairs, legacy tasks and unrelated plans stay separate.
export function homeTaskCards(tasks) {
  const pairs = new Map();
  for (const task of tasks) {
    if (!task.careFlowId || !task.customerReadOnly) continue;
    const id = String(task.careFlowId);
    const pair = pairs.get(id) || { arrangements: [], uploads: [] };
    if (task._id === `care-plan:${id}:arrangement`) pair.arrangements.push(task);
    if (task._id === `care-plan:${id}:upload` && task.uploadReminder && task.canUploadReports) pair.uploads.push(task);
    pairs.set(id, pair);
  }
  const hidden = new Set(), cards = new Map();
  for (const pair of pairs.values()) {
    if (pair.arrangements.length !== 1 || pair.uploads.length !== 1) continue;
    const task = pair.arrangements[0], upload = pair.uploads[0];
    cards.set(task, { ...task, uploadTask: upload });
    hidden.add(upload);
  }
  return tasks.filter(task => !hidden.has(task)).map(task => cards.get(task) || task);
}
