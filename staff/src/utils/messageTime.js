const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
const clockFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// Keep the first loaded message anchored to its date; subsequent clusters only
// need the clock unless they cross a Shanghai calendar-day boundary.
export function messageTimeSeparator(value, previousValue) {
  if (!value) return '';
  const current = new Date(value);
  if (!Number.isFinite(current.getTime())) return '';
  const previous = previousValue ? new Date(previousValue) : null;
  const day = dateFormat.format(current);
  const newDay = !previous || !Number.isFinite(previous.getTime()) || day !== dateFormat.format(previous);
  if (!newDay && current - previous < 5 * 60 * 1000) return '';
  return `${newDay ? day.replaceAll('-', '/') + ' ' : ''}${clockFormat.format(current)}`;
}
