const { validDay } = require('../../../shared/annualAppointment.cjs');

function addMonths(day, months) {
  if (!validDay(day) || !Number.isInteger(months) || months < 1 || months > 24) return '';
  const [year, month, date] = day.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(date, last)).padStart(2, '0')}`;
}

function reviewPlanFromInput(value) {
  if (!value || value.kind === 'none') return { kind: 'none', intervalMonths: null, items: [] };
  if (value.kind !== 'recheck') throw Object.assign(new Error('请选择复查安排类型'), { statusCode: 400 });
  const intervalMonths = Number(value.intervalMonths);
  const anchorDate = String(value.anchorDate || '');
  const items = [...new Set((Array.isArray(value.items) ? value.items : String(value.items || '').split(/[、，,;；\n]/))
    .map(item => String(item).trim()).filter(Boolean))];
  if (!Number.isInteger(intervalMonths) || intervalMonths < 1 || intervalMonths > 24)
    throw Object.assign(new Error('复查间隔须为1至24个月'), { statusCode: 400 });
  if (!validDay(anchorDate)) throw Object.assign(new Error('请选择复查间隔的起算日期'), { statusCode: 400 });
  if (!items.length || items.length > 20 || items.some(item => item.length > 80))
    throw Object.assign(new Error('请逐项填写需要复查的检查项目'), { statusCode: 400 });
  return { kind: 'recheck', intervalMonths, anchorDate, items };
}

function legacyReviewNote(note) {
  return /(?:\d{1,2}|[一二三四五六七八九十两]+)\s*(?:个)?月.{0,12}复查|复查.{0,12}(?:\d{1,2}|[一二三四五六七八九十两]+)\s*(?:个)?月/.test(String(note || ''));
}

function reviewIntent(source) {
  const plan = source.content?.reviewPlan;
  if (plan?.kind !== 'recheck') return null;
  const dueDate = addMonths(plan.anchorDate, plan.intervalMonths);
  return { sourceId: source.id, problem: source.content.problem, dueDate,
    items: plan.items || [], intervalMonths: plan.intervalMonths };
}

function reviewGroups(evidence = []) {
  const grouped = new Map();
  for (const source of evidence) {
    const intent = reviewIntent(source);
    if (!intent) continue;
    const key = `${intent.dueDate.slice(0, 7)}:${intent.intervalMonths}`;
    if (!grouped.has(key)) grouped.set(key, { dueDate: intent.dueDate, intervalMonths: intent.intervalMonths, sourceIds: [], items: [], problems: [] });
    const group = grouped.get(key);
    if (intent.dueDate && (!group.dueDate || intent.dueDate < group.dueDate)) group.dueDate = intent.dueDate;
    group.sourceIds.push(intent.sourceId);
    group.items.push(...intent.items);
    group.problems.push(intent.problem);
  }
  return [...grouped.values()].map(group => ({ ...group, items: [...new Set(group.items)], problems: [...new Set(group.problems)] }));
}

module.exports = { addMonths, reviewPlanFromInput, legacyReviewNote, reviewIntent, reviewGroups };
