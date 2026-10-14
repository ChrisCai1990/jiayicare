// Read only printed echo measurements. Compare the same chamber metric within
// five calendar years; a diameter, volume, and volume index are separate series.
const ECHO_REPORT = /心脏超声|心脏彩超|超声心动图|心超/;
const METRICS = [
  { key: 'la_diameter', label: '左房内径', unit: 'mm', name: /左(?:心)?房(?:前后径|内径|径)|\bLAD\b|\bLA\s*(?:径|diameter)\b|^左(?:心)?房(?:\s*[（(]LA[）)])?$/i,
    text: /(?:左(?:心)?房(?:前后径|内径|径)|\bLAD\b)\s*[（(]?(?:LA)?[）)]?\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm)\b/i },
  { key: 'ra_diameter', label: '右房内径', unit: 'mm', name: /右(?:心)?房(?:内径|径)|\bRAD\b|^右(?:心)?房(?:\s*[（(]RA[）)])?$/i,
    text: /(?:右(?:心)?房(?:内径|径)|\bRAD\b)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm)\b/i },
  { key: 'lv_diastolic_diameter', label: '左室舒张末内径', unit: 'mm', name: /左(?:心)?室舒张末(?:期)?(?:内径|径)|\bLVEDD\b|\bLVIDd\b/i,
    text: /(?:左(?:心)?室舒张末(?:期)?(?:内径|径)|\bLVEDD\b|\bLVIDd\b)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm)\b/i },
  { key: 'lv_unspecified_diameter', label: '左室内径（时相未注明）', unit: 'mm', name: /左(?:心)?室(?:内径|径)(?!.*舒张|.*收缩)/i,
    text: /左(?:心)?室(?:内径|径)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm)\b/i },
  { key: 'rv_diameter', label: '右室内径', unit: 'mm', name: /右(?:心)?室(?:内径|径)|\bRVD\b|^右(?:心)?室(?:\s*[（(]RV[）)])?$/i,
    text: /(?:右(?:心)?室(?:内径|径)|\bRVD\b)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm)\b/i },
  { key: 'la_volume', label: '左房容积', unit: 'mL', name: /左(?:心)?房(?:容积|容量)(?!指数)|\bLAV\b(?!i)/i,
    text: /(?:左(?:心)?房(?:容积|容量)(?!指数)|\bLAV\b(?!i))\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(mL|ml)\b/i },
  { key: 'la_volume_index', label: '左房容积指数', unit: 'mL/m²', name: /左(?:心)?房(?:容积|容量)指数|\bLAVI\b/i,
    text: /(?:左(?:心)?房(?:容积|容量)指数|\bLAVI\b)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(mL\s*\/\s*m(?:2|²))(?=$|[^A-Za-z0-9])/i },
];

function normalizeValue(value, unit, expectedUnit) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const printed = String(unit || '').trim().toLowerCase().replace(/\s/g, '').replace('²', '2');
  if (expectedUnit === 'mm') {
    if (printed === 'mm') return number;
    if (printed === 'cm') return Number((number * 10).toFixed(2));
  }
  if (expectedUnit === 'mL' && printed === 'ml') return number;
  if (expectedUnit === 'mL/m²' && printed === 'ml/m2') return number;
  return null;
}

function sourceDate(value, fallbackYear) {
  const full = String(value || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(full)) return full;
  if (/^\d{4}$/.test(full)) return full;
  const year = Number(fallbackYear);
  return Number.isInteger(year) && year >= 1900 ? String(year) : '';
}

function buildEchoChamberTrend(reports, referenceYear = new Date().getFullYear()) {
  const cutoff = referenceYear - 4;
  const series = new Map(METRICS.map(metric => [metric.key, []]));
  (reports || []).forEach(report => {
    const date = sourceDate(report.checkDate || report.date, report.reportYear);
    const items = report.reportItems || [];
    if (!ECHO_REPORT.test([report.title, report.screeningL2, ...items.map(item => item.name)].filter(Boolean).join(' '))
      && !items.some(item => /彩超|超声/.test(String(item.name || '')) && /心脏/.test(String(item.bodyPart || '')))) return;
    const inWindow = pointDate => {
      const year = Number(pointDate.slice(0, 4));
      return Number.isInteger(year) && year >= cutoff && year <= referenceYear;
    };
    METRICS.forEach(metric => {
      let point = null;
      for (const item of items) {
        if (!metric.name.test(String(item.name || ''))) continue;
        const match = String(item.value || '').match(/^(\d+(?:\.\d+)?)\s*(mm|cm|mL(?:\s*\/\s*m(?:2|²))?)?$/i);
        if (!match) continue;
        const value = normalizeValue(match[1], item.unit || match[2], metric.unit);
        const itemDate = sourceDate(item.examDate, null) || date;
        if (value !== null && inWindow(itemDate)) { point = { date: itemDate, value }; break; }
      }
      if (!point) {
        for (const item of items) {
          const match = [item.findings, item.diagnosis, item.conclusion].filter(Boolean).join('；').match(metric.text);
          if (!match) continue;
          const value = normalizeValue(match[1], match[2], metric.unit);
          const itemDate = sourceDate(item.examDate, null) || date;
          if (value !== null && inWindow(itemDate)) { point = { date: itemDate, value }; break; }
        }
      }
      if (!point && inWindow(date)) {
        const match = [report.examConclusion, report.note].filter(Boolean).join('；').match(metric.text);
        if (match) {
          const value = normalizeValue(match[1], match[2], metric.unit);
          if (value !== null) point = { date, value };
        }
      }
      if (point) series.get(metric.key).push({ ...point,
        reportId: report._id ? String(report._id) : null });
    });
  });
  return METRICS.flatMap(metric => {
    const points = series.get(metric.key).sort((a, b) => a.date.localeCompare(b.date))
      .filter((point, index, all) => index === 0 || point.date !== all[index - 1].date || point.value !== all[index - 1].value);
    if (!points.length) return [];
    const first = points[0], last = points[points.length - 1];
    const distinctDates = new Set(points.map(point => point.date));
    const conflictingDate = points.some((point, index) => index > 0
      && point.date === points[index - 1].date && point.value !== points[index - 1].value);
    const comparable = distinctDates.size >= 2 && !conflictingDate;
    return [{ key: metric.key, name: metric.label, unit: metric.unit, points,
      change: comparable ? Number((last.value - first.value).toFixed(2)) : null,
      note: conflictingDate ? '同日测量值不一致，待核对原报告' : distinctDates.size < 2 ? '仅一个检查日期，暂不判断变化' : '' }];
  });
}

module.exports = { buildEchoChamberTrend };
