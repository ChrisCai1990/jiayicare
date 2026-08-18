const DEFAULT_FIELDS = [
  'name', 'value', 'unit', 'referenceRange', 'status',
  'bodyPart', 'findings', 'diagnosis', 'conclusion', 'screeningKey',
];

const HIGH_ATTENTION_NAMES = [
  /白细胞|红细胞|血红蛋白|血小板|中性粒细胞|淋巴细胞|单核细胞|嗜酸性粒细胞|嗜碱性粒细胞/,
  /肌酐|尿素|尿酸|丙氨酸氨基转移酶|天门冬氨酸氨基转移酶|总胆红素/,
  /空腹血糖|糖化血红蛋白|甲胎蛋白|癌胚抗原/,
];

const { reportItemSourcePages } = require('./reportItemEvidence');

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function itemMap(items = []) {
  const occurrence = new Map();
  return new Map(items.map((item, index) => {
    const fallback = `${Number(item?.sourcePage) || 0}|${normalizeText(item?.itemType)}|${normalizeText(item?.name)}`;
    const base = normalizeText(item?.sourceItemId) || fallback || `index:${index}`;
    const count = (occurrence.get(base) || 0) + 1;
    occurrence.set(base, count);
    return [`${base}#${count}`, item || {}];
  }));
}

function publicItem(key, item) {
  return {
    key,
    sourceItemId: normalizeText(item.sourceItemId),
    name: normalizeText(item.name),
    itemType: normalizeText(item.itemType),
    sourcePage: Number(item.sourcePage) || null,
    sourcePages: reportItemSourcePages(item),
  };
}

function sameOriginalSource(current, baseline) {
  const currentKeys = (current?.source?.ossKeys || []).map(normalizeText).filter(Boolean).sort();
  const baselineKeys = (baseline?.source?.ossKeys || []).map(normalizeText).filter(Boolean).sort();
  return currentKeys.length > 0
    && currentKeys.length === baselineKeys.length
    && currentKeys.every((key, index) => key === baselineKeys[index]);
}

function pageCounts(items = []) {
  const counts = new Map();
  for (const item of items) {
    for (const page of reportItemSourcePages(item)) {
      counts.set(page, (counts.get(page) || 0) + 1);
    }
  }
  return counts;
}

function comparePageCoverage(currentItems = [], baselineItems = []) {
  const current = pageCounts(currentItems);
  const baseline = pageCounts(baselineItems);
  const pages = [...new Set([...current.keys(), ...baseline.keys()])].sort((a, b) => a - b);
  const changed = pages.flatMap(page => {
    const currentCount = current.get(page) || 0;
    const baselineCount = baseline.get(page) || 0;
    return currentCount === baselineCount ? [] : [{ page, currentCount, baselineCount }];
  });
  return {
    emptied: changed.filter(item => item.baselineCount > 0 && item.currentCount === 0),
    newlyPopulated: changed.filter(item => item.baselineCount === 0 && item.currentCount > 0),
    changed,
  };
}

function compareHistoricalPageCoverage(currentItems = [], historicalExtractions = []) {
  const current = pageCounts(currentItems);
  const historicalMax = new Map();
  for (const extraction of historicalExtractions) {
    for (const [page, count] of pageCounts(extraction?.items || [])) {
      const previous = historicalMax.get(page);
      if (!previous || count > previous.count) {
        historicalMax.set(page, { count, version: Number(extraction?.version) || null });
      }
    }
  }
  const pages = [...new Set([...current.keys(), ...historicalMax.keys()])].sort((a, b) => a - b);
  const changed = pages.flatMap(page => {
    const currentCount = current.get(page) || 0;
    const historical = historicalMax.get(page) || { count: 0, version: null };
    return currentCount === historical.count ? [] : [{
      page,
      currentCount,
      baselineCount: historical.count,
      baselineVersion: historical.version,
    }];
  });
  return {
    emptied: changed.filter(item => item.baselineCount > 0 && item.currentCount === 0),
    decreased: changed.filter(item => item.baselineCount > item.currentCount && item.currentCount > 0),
    newlyPopulated: changed.filter(item => item.baselineCount === 0 && item.currentCount > 0),
    changed,
    comparedVersions: historicalExtractions.map(item => Number(item?.version)).filter(Number.isFinite).sort((a, b) => a - b),
    basis: 'same_source_history_max',
  };
}

function findHistoricalEmptyPages(currentItems = [], currentSource = {}, historicalExtractions = [], totalPages = Infinity) {
  const sameSourceHistory = historicalExtractions.filter(extraction => sameOriginalSource(
    { source: currentSource },
    extraction,
  ));
  if (!sameSourceHistory.length) return [];
  return compareHistoricalPageCoverage(currentItems, sameSourceHistory).emptied
    .filter(item => item.page <= totalPages);
}

function compareReportExtractions(current, baseline, fields = DEFAULT_FIELDS) {
  const baselineItems = baseline?.items || [];
  const currentItems = current?.items || [];
  const before = itemMap(baselineItems);
  const after = itemMap(currentItems);
  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, item] of after) {
    if (!before.has(key)) {
      added.push(publicItem(key, item));
      continue;
    }
    const previous = before.get(key);
    const changes = fields.flatMap(field => normalizeText(previous[field]) === normalizeText(item[field])
      ? []
      : [{ field, before: previous[field] ?? '', after: item[field] ?? '' }]);
    if (changes.length) changed.push({ ...publicItem(key, item), changes });
  }
  for (const [key, item] of before) {
    if (!after.has(key)) removed.push(publicItem(key, item));
  }

  const currentCount = after.size;
  const baselineCount = before.size;
  const dropCount = Math.max(0, baselineCount - currentCount);
  const dropRatio = baselineCount ? dropCount / baselineCount : 0;
  const highAttentionRemoved = removed.filter(item => HIGH_ATTENTION_NAMES.some(pattern => pattern.test(item.name)));
  const pageCoverage = comparePageCoverage(currentItems, baselineItems);
  const severity = pageCoverage.emptied.length || highAttentionRemoved.length || dropRatio >= 0.1
    ? 'high'
    : (removed.length ? 'review' : 'none');

  return {
    sameSource: sameOriginalSource(current, baseline),
    currentVersion: Number(current?.version) || null,
    baselineVersion: Number(baseline?.version) || null,
    summary: {
      currentCount,
      baselineCount,
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      dropCount,
      dropRatio: Number(dropRatio.toFixed(4)),
      severity,
      highAttentionRemoved: highAttentionRemoved.length,
    },
    added,
    removed,
    changed,
    highAttentionRemoved,
    pageCoverage,
  };
}

function validateCoverageAcknowledgement(diff, acknowledgedPages = []) {
  const requiredPages = (diff?.pageCoverage?.emptied || []).map(item => Number(item.page)).filter(Number.isInteger);
  const acknowledged = new Set((Array.isArray(acknowledgedPages) ? acknowledgedPages : [])
    .map(Number).filter(page => Number.isInteger(page) && page > 0));
  const missingPages = requiredPages.filter(page => !acknowledged.has(page));
  return { requiredPages, missingPages, complete: missingPages.length === 0 };
}

function compareReportExtractionHistory(current, historicalExtractions = []) {
  const sameSourceHistory = historicalExtractions
    .filter(item => Number(item?.version) < Number(current?.version) && sameOriginalSource(current, item))
    .sort((a, b) => Number(b.version) - Number(a.version));
  if (!sameSourceHistory.length) return null;
  const result = compareReportExtractions(current, sameSourceHistory[0]);
  result.pageCoverage = compareHistoricalPageCoverage(current?.items || [], sameSourceHistory);
  result.historyVersions = sameSourceHistory.map(item => Number(item.version));
  result.coverageBaseline = 'same_source_history_max';
  if (result.pageCoverage.emptied.length) result.summary.severity = 'high';
  return result;
}

module.exports = {
  compareReportExtractions,
  compareReportExtractionHistory,
  sameOriginalSource,
  comparePageCoverage,
  compareHistoricalPageCoverage,
  findHistoricalEmptyPages,
  validateCoverageAcknowledgement,
};
