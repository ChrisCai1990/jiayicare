// A marker described as elevated must have a measured value above its printed
// upper reference limit. The AI's prose and the OCR status are not evidence.
const MARKERS = [
  { name: 'CA72-4', pattern: /CA\s*-?\s*72\s*-?\s*4|CA\s*-?\s*724|糖[类链]抗原\s*72\s*-?\s*4|糖[类链]抗原\s*724/i },
  { name: 'CA19-9', pattern: /CA\s*-?\s*19\s*-?\s*9|CA\s*-?\s*199|糖[类链]抗原\s*19\s*-?\s*9|糖[类链]抗原\s*199/i },
  { name: 'CA125', pattern: /CA\s*-?\s*125|糖[类链]抗原\s*125/i },
  { name: 'CA15-3', pattern: /CA\s*-?\s*15\s*-?\s*3|CA\s*-?\s*153|糖[类链]抗原\s*15\s*-?\s*3/i },
  { name: 'CEA', pattern: /\bCEA\b|癌胚抗原/i },
  { name: 'AFP', pattern: /\bAFP\b|甲胎蛋白/i },
  { name: 'NSE', pattern: /\bNSE\b|神经元特异性烯醇化酶/i },
  { name: 'HE4', pattern: /\bHE4\b|人附睾蛋白4/i },
  { name: 'PSA', pattern: /(?<![a-z])PSA\b|前列腺特异抗原/i },
];

function upperReference(range) {
  const text = String(range || '').replace(/[，,]/g, '').trim();
  // Support printed upper bounds (<6.9, <=6.9, 0-6.9, ≤6.9).
  const match = text.match(/(?:<=|<|≤|＜)\s*(\d+(?:\.\d+)?)/)
    || text.match(/(?:\d+(?:\.\d+)?\s*[-~～—至]\s*)(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function classifyTumorMarkerItem(item) {
  const matches = MARKERS.filter(marker => marker.pattern.test(String(item?.name || '')));
  if (!matches.length) return null;
  if (matches.length > 1) return 'unknown';
  const value = String(item.value ?? '').trim();
  const match = value.match(/^(\d+(?:\.\d+)?)(?:\s*[A-Za-zµμ/]+)?$/);
  const upper = upperReference(item.referenceRange);
  if (!match || upper === null) return 'unknown';
  return Number(match[1]) > upper ? 'elevated' : 'normal';
}

function markerPoints(reports, marker) {
  return (reports || []).flatMap(report => (report.reportItems || []).filter(item =>
    marker.pattern.test(String(item.name || ''))
      && MARKERS.filter(candidate => candidate.pattern.test(String(item.name || ''))).length === 1).map(item => {
    return {
      date: String(report.checkDate || report.date || '').slice(0, 10),
      elevated: classifyTumorMarkerItem(item) === 'elevated',
    };
  }));
}

function collectText(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach(item => collectText(item, output));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => {
    if (!['sourceEvidence', 'sourceReportIds'].includes(key)) collectText(item, output);
  });
  return output;
}

function findUnsupportedTumorMarkerElevation(sections, reports) {
  const clauses = collectText(sections).flatMap(text => text.split(/[，。；;\n]/));
  for (const marker of MARKERS) {
    for (const clause of clauses) {
      if (!marker.pattern.test(clause) || !/(?:升高|增高|偏高|高于参考|超出参考)/.test(clause)) continue;
      if (/(?:未|无|不)(?:见|存在|伴有|明显)?(?:升高|增高|偏高)/.test(clause)) continue;
      const points = markerPoints(reports, marker);
      const elevated = points.filter(point => point.elevated);
      const sustained = /持续|连续|反复|多年/.test(clause);
      const latest = points.filter(point => point.date).sort((a, b) => b.date.localeCompare(a.date))[0];
      const explicitlyHistorical = /曾|既往|早年|历史|过去|20\d{2}年/.test(clause)
        && !/目前|当前|近期|最近|现在|持续|连续|反复/.test(clause);
      if (!elevated.length || (sustained && elevated.length < 2)
        || (!explicitlyHistorical && !latest?.elevated)) {
        return { marker: marker.name, claim: clause.trim() };
      }
    }
  }
  return null;
}

module.exports = { MARKERS, classifyTumorMarkerItem, findUnsupportedTumorMarkerElevation, upperReference };
