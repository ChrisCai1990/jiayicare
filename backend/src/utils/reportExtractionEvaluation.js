const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const normalizePage = row => Number(row.sourcePage || row.page || 1);
const keyOf = row => [normalizePage(row), normalize(row.sourceSection || row.section), normalize(row.name)].join('|');
const fields = ['value', 'unit', 'referenceRange', 'findings', 'diagnosis', 'conclusion'];

function evaluateReport({ reportType, truth, extracted }) {
  if (!Array.isArray(truth) || !Array.isArray(extracted)) throw new Error('truth 和 extracted 必须是数组');
  const groups = new Map();
  for (const row of extracted) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const rows of groups.values()) rows.sort((a, b) => Number(a.sourceRowOrder || a.rowOrder || 0) - Number(b.sourceRowOrder || b.rowOrder || 0));
  const fieldTotals = Object.fromEntries(fields.map(field => [field, { expected: 0, correct: 0 }]));
  let matched = 0;
  let abnormalExpected = 0;
  let abnormalMatched = 0;
  const missingPages = new Set();
  const sortedTruth = [...truth].sort((a, b) => normalizePage(a) - normalizePage(b)
    || Number(a.sourceRowOrder || a.rowOrder || 0) - Number(b.sourceRowOrder || b.rowOrder || 0));
  for (const row of sortedTruth) {
    const candidates = groups.get(keyOf(row)) || [];
    const actual = candidates.shift();
    if (actual) matched++;
    else missingPages.add(normalizePage(row));
    for (const field of fields) {
      if (!normalize(row[field])) continue;
      fieldTotals[field].expected++;
      if (actual && normalize(actual[field]) === normalize(row[field])) fieldTotals[field].correct++;
    }
    if (row.status === 'abnormal') {
      abnormalExpected++;
      if (actual?.status === 'abnormal') abnormalMatched++;
    }
  }
  return { reportType: String(reportType || 'unknown'), expectedRows: truth.length, matchedRows: matched,
    missingRows: truth.length - matched, extraRows: [...groups.values()].reduce((sum, rows) => sum + rows.length, 0),
    missingPages: [...missingPages].sort((a, b) => a - b), abnormalExpected, abnormalMatched, fields: fieldTotals };
}

function aggregateEvaluations(reports) {
  const byType = new Map();
  for (const report of reports) {
    const result = evaluateReport(report);
    const total = byType.get(result.reportType) || { reportType: result.reportType,
      reports: 0, expectedRows: 0, matchedRows: 0, missingRows: 0, extraRows: 0,
      abnormalExpected: 0, abnormalMatched: 0,
      fields: Object.fromEntries(fields.map(field => [field, { expected: 0, correct: 0 }])) };
    total.reports++;
    for (const key of ['expectedRows', 'matchedRows', 'missingRows', 'extraRows', 'abnormalExpected', 'abnormalMatched']) total[key] += result[key];
    for (const field of fields) {
      total.fields[field].expected += result.fields[field].expected;
      total.fields[field].correct += result.fields[field].correct;
    }
    byType.set(result.reportType, total);
  }
  return [...byType.values()].sort((a, b) => a.reportType.localeCompare(b.reportType));
}

module.exports = { evaluateReport, aggregateEvaluations };
