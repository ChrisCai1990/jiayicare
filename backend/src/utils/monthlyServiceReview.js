const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function shanghaiMonth(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(date);
}

function shanghaiDay(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', day: 'numeric' }).format(date));
}

function monthIndex(month) {
  const match = MONTH_RE.exec(String(month || ''));
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : NaN;
}

function monthFromIndex(index) {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}

function inPlanWindow(plan, month, now = new Date()) {
  if (!plan?.confirmedAt) return false;
  const target = monthIndex(month);
  const start = monthIndex(shanghaiMonth(new Date(plan.confirmedAt)));
  const current = monthIndex(shanghaiMonth(now));
  return Number.isFinite(target) && target >= start && target < start + 12 && target <= current;
}

function dueMonths(plan, now = new Date()) {
  if (!plan?.confirmedAt) return [];
  const start = monthIndex(shanghaiMonth(new Date(plan.confirmedAt)));
  const current = monthIndex(shanghaiMonth(now));
  if (!Number.isFinite(start)) return [];
  const end = Math.min(start + 11, shanghaiDay(now) >= 25 ? current : current - 1);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => monthFromIndex(start + i));
}

module.exports = { shanghaiMonth, monthIndex, inPlanWindow, dueMonths };
