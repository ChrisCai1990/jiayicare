export function splitMonitoringPeriods(value) {
  return [...new Set(String(value || '').split(/[、，,;；\n]+/).map(item => item.trim()).filter(Boolean))]
}

export function toggleMonitoringPeriod(value, period) {
  const periods = splitMonitoringPeriods(value)
  return (periods.includes(period) ? periods.filter(item => item !== period) : [...periods, period]).join('、')
}
