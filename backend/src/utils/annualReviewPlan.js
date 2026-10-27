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

function legacyReviewPlan(decision, report) {
  if (decision.reviewPlan?.kind === 'recheck' || !legacyReviewNote(decision.note)) return null;
  const note = String(decision.note || '');
  const chineseNumber = value => {
    const digits = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (value === '十') return 10;
    if (value.includes('十')) {
      const [tens, ones] = value.split('十');
      return (tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0);
    }
    return digits[value];
  };
  const intervals = [...note.matchAll(/(\d{1,2}|[一二三四五六七八九十两]{1,3})\s*(?:个)?月/g)]
    .map(match => /^\d/.test(match[1]) ? Number(match[1]) : chineseNumber(match[1]));
  if (intervals.length !== 1 || intervals[0] < 1 || intervals[0] > 24) return null;
  const source = decision.sourceSnapshot?.item || ((report.reportItems || []).length === 1 ? report.reportItems[0] : null);
  const item = String(source?.name || '').trim();
  const sourceDate = String(source?.examDate || report.checkDate || '').slice(0, 10);
  const reviewedAt = decision.reviewedAt && !Number.isNaN(Date.parse(decision.reviewedAt))
    ? new Date(Date.parse(decision.reviewedAt) + 8 * 3600000).toISOString().slice(0, 10) : '';
  const anchorDate = /(?:检查|报告|体检)后\s*(?:\d{1,2}|[一二三四五六七八九十两]+)\s*(?:个)?月/.test(note)
    ? sourceDate : reviewedAt;
  if (!item || !validDay(anchorDate)) return null;
  return { kind: 'recheck', intervalMonths: intervals[0], anchorDate, items: [item] };
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

module.exports = { addMonths, reviewPlanFromInput, legacyReviewNote, legacyReviewPlan, reviewIntent, reviewGroups };
