// List-only simplification: clinical qualifications (e.g. contrast MRI) stay intact.
export function serviceTaskTitle(task) {
  const title = String(task?.theme || '')
  if (!task?.careFlowId) return title
  return title.replace(/\s*[（(]重点(?:观察|关注)[^）)]*[）)]?\s*$/, '').trim()
}
