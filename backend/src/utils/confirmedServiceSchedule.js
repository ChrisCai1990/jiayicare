function formatChinaServiceDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function extractConfirmedServiceTime(...values) {
  const text = values.filter(Boolean).map(String).join('\n');
  if (!text) return '';
  const matches = [...text.matchAll(/(?:上午|下午|晚上|早上|中午)?\s*([01]?\d|2[0-3])(?::([0-5]\d)|点(?:半|[0-5]?\d分)?)/g)];
  if (!matches.length) return '';

  const ranked = matches.map((match, index) => {
    const start = Math.max(0, match.index - 12);
    const end = Math.min(text.length, match.index + match[0].length + 12);
    const context = text.slice(start, end);
    const score = /集合|碰面|会合|见面|签到|到达/.test(context) ? 2 : /门诊|就诊|开诊|预约/.test(context) ? 1 : 0;
    return { value: match[0].replace(/\s+/g, ''), score, index };
  });
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0].value;
}

function confirmedServiceSchedule(order, briefNote = '') {
  if (!order) return { serviceDate: '', serviceTime: '' };
  return {
    serviceDate: formatChinaServiceDate(order.desiredServiceDate || order.scheduledAt),
    serviceTime: extractConfirmedServiceTime(order.note, order.serviceRequirements, briefNote),
  };
}

function applyConfirmedServiceSchedule(content, order, briefNote = '') {
  const existing = content || {};
  const confirmed = confirmedServiceSchedule(order, briefNote);
  return {
    ...existing,
    serviceDate: existing.serviceDate || confirmed.serviceDate,
    serviceTime: existing.serviceTime || confirmed.serviceTime,
  };
}

module.exports = {
  formatChinaServiceDate,
  extractConfirmedServiceTime,
  confirmedServiceSchedule,
  applyConfirmedServiceSchedule,
};
