function parseReportDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/(20\d{2})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) { return date.toISOString().slice(0, 10); }

function nextAnnualCheckupDate(reports = []) {
  const dates = reports.flatMap(report => [
    parseReportDate(report.checkDate),
    ...(report.reportItems || []).map(item => parseReportDate(item.examDate)),
  ]).filter(Boolean);
  if (!dates.length) return '';
  const latest = new Date(Math.max(...dates.map(date => date.getTime())));
  const originalDay = latest.getUTCDate();
  latest.setUTCDate(1);
  latest.setUTCMonth(latest.getUTCMonth() + 11);
  const lastDayOfTargetMonth = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() + 1, 0)).getUTCDate();
  latest.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return formatDate(latest);
}

const HEPATITIS_B_MARKERS = [
  /乙型肝炎病毒?表面抗原|乙肝表面抗原|HBsAg/i,
  /乙型肝炎病毒?表面抗体|乙肝表面抗体|HBsAb|anti-?HBs/i,
  /乙型肝炎病毒?[eE]抗原|乙肝[eE]抗原|HBeAg/i,
  /乙型肝炎病毒?[eE]抗体|乙肝[eE]抗体|HBeAb|anti-?HBe/i,
  /乙型肝炎病毒?核心抗体|乙肝核心抗体|HBcAb|anti-?HBc/i,
];

function isNegative(value) { return /阴性|negative|未检出|^\s*[-－]\s*$/i.test(String(value || '')); }

function hepatitisBAllNegative(reports = []) {
  const latestByMarker = HEPATITIS_B_MARKERS.map(pattern => {
    const matches = [];
    reports.forEach(report => (report.reportItems || []).forEach(item => {
      if (pattern.test(String(item.name || ''))) {
        matches.push({ value: item.value, date: parseReportDate(item.examDate || report.checkDate)?.getTime() || 0 });
      }
    }));
    return matches.sort((a, b) => b.date - a.date)[0];
  });
  return latestByMarker.every(item => item && isNegative(item.value));
}

function conciseTitle(value, maxLength = 20) {
  const text = String(value || '').trim();
  const firstClause = text.split(/[：:；;，,。\n]/)[0].trim();
  return (firstClause || text).slice(0, maxLength);
}

module.exports = { nextAnnualCheckupDate, hepatitisBAllNegative, conciseTitle };
