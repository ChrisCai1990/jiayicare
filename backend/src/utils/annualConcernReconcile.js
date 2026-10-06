const REVIEWED_KINDS = new Set(['ai_health_trend', 'reviewed_chronic_tag', 'reviewed_cardiovascular_tag', 'reviewed_tumor_tag']);

function conceptKey(title) {
  const name = String(title || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  if (/^(高血压|血压|血压升高|血压异常)$/.test(name)) return 'hypertension';
  if (/^(糖代谢异常|糖尿病前期|糖耐量受损|空腹血糖受损|血糖异常|血糖)$/.test(name)) return 'prediabetes_glucose';
  if (/^(动脉粥样硬化|动脉硬化|颈动脉粥样硬化)$/.test(name)) return 'atherosclerosis';
  if (name.includes('萎缩') && name.includes('胃炎') && name.includes('肠化')) return 'atrophic_gastritis_metaplasia';
  return `title:${name}`;
}

function sourceKeys(row) {
  return [...new Set([row.key, ...(row.mergedSourceKeys || [])].filter(Boolean))];
}

function sourceDetails(row) {
  return (row.mergedSources?.length ? row.mergedSources : [{
    key: row.key, kind: row.kind, title: row.title, evidence: row.evidence,
    source: row.source, includedByName: row.includedByName,
  }]).filter(item => item.key);
}

function mergePair(first, second) {
  const preferred = (first.status === 'suggested' && second.status !== 'suggested')
    || (first.status === second.status && second.reviewedAt && !first.reviewedAt) ? second : first;
  const other = preferred === first ? second : first;
  const details = [...sourceDetails(first), ...sourceDetails(second)];
  const seen = new Set();
  const mergedSources = details.filter(item => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
  const evidence = [...new Set(mergedSources.map(item => item.evidence).filter(Boolean))].join('；').slice(0, 1600);
  return { ...preferred, evidence: evidence || preferred.evidence || other.evidence,
    mergedSourceKeys: [...new Set([...sourceKeys(first), ...sourceKeys(second)])], mergedSources };
}

function reconcileReviewedConcerns(existing = [], incoming = []) {
  const rows = [];
  const conceptIndex = new Map();
  let merged = 0;
  let added = 0;
  const process = (row, isIncoming) => {
    if (!REVIEWED_KINDS.has(row.kind)) {
      if (!isIncoming) rows.push(row);
      return;
    }
    const concept = conceptKey(row.title);
    const index = conceptIndex.get(concept);
    if (index === undefined) {
      rows.push(row);
      conceptIndex.set(concept, rows.length - 1);
      if (isIncoming) added++;
      return;
    }
    const current = rows[index];
    if (isIncoming && sourceKeys(current).includes(row.key)) return;
    rows[index] = mergePair(current, row);
    merged++;
  };
  existing.forEach(row => process(row, false));
  incoming.forEach(row => process(row, true));
  return { rows, added, merged, changed: added > 0 || merged > 0 };
}

module.exports = { REVIEWED_KINDS, conceptKey, reconcileReviewedConcerns };
