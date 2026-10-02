export function notificationTotal(summary = {}) {
  return ['pendingReferralCount', 'unreadMessageCount', 'unreadRepliedCount', 'metabolicHelpCount'].reduce((sum, key) => sum + Math.max(0, Number(summary[key]) || 0), 0)
}

export function taskProgress(tasks = []) {
  const relevant = tasks.filter(task => !['cancelled', 'canceled'].includes(task.status))
  const completed = relevant.filter(task => ['completed', 'done'].includes(task.status)).length
  const remaining = relevant.length - completed
  return { completed, remaining, total: relevant.length, state: !relevant.length ? '待开始' : remaining ? '进行中' : '已完成' }
}

export function followUpDateRange(key, today) {
  const date = new Date(`${today}T12:00:00`)
  const shift = days => {
    const value = new Date(date); value.setDate(value.getDate() + days)
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  if (key === 'overdue') return { from: '', to: shift(-1), status: 'active' }
  if (key === 'today') return { from: today, to: today }
  if (key === 'week') return { from: today, to: shift(6) }
  return { from: '', to: '' }
}

export function filterReviewTodos(todos, { query = '', age = 'all', priority = 'all', sort = 'priority', config = {}, now = Date.now() } = {}) {
  const keyword = query.trim().toLowerCase()
  const level = todo => todo.priority || config[todo.type]?.priority || 4
  const time = todo => { const value = Date.parse(todo.createdAt); return Number.isFinite(value) ? value : null }
  const filtered = todos.filter(todo => {
    if (keyword && ![todo.patientName, todo.label, config[todo.type]?.label, todo.summary].filter(Boolean).join(' ').toLowerCase().includes(keyword)) return false
    if (priority === 'urgent' && level(todo) !== 1) return false
    if (age === 'overdue' && !todo.overdue) return false
    if (age === 'week' && (time(todo) === null || now - time(todo) < 7 * 86400000)) return false
    return true
  })
  return filtered.sort((a, b) => (sort === 'priority' ? level(a) - level(b) : 0) || (time(a) ?? Infinity) - (time(b) ?? Infinity) || String(a.id).localeCompare(String(b.id)))
}

export function readableServiceText(text = '') {
  return String(text).replace(/\bproxy_booking\b/g, '代预约').replace(/\bbody_comp\b/g, '身体成分')
    .replace(/(?:[（(]?来源[：:]\s*)(?:missing:\d+|priority:\d+|[\w.]+_risk\.missing|review:[a-f\d]{24})[）)]?/gi, '来源：方案依据（详见原方案）')
}
