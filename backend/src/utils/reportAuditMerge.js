const text = value => String(value || '').trim();
const key = value => text(value).toLowerCase().replace(/[\s，,、:：;；()（）\[\]【】\-_/]/g, '');
const missing = value => !text(value) || /^[\-—－–]+$/.test(text(value));
const evidenceFields = ['value', 'findings', 'diagnosis', 'conclusion', 'pathologyFindings', 'pathologyDiagnosis'];

function normalizeExplicitNormalStatus(item) {
  if (item.status !== 'unknown' && text(item.status)) return item;
  const normal = /^(?:未见(?:明显)?异常|未见异常所见|正常|阴性)[。．.!！]?$/;
  const narrative = ['findings', 'diagnosis', 'conclusion', 'pathologyFindings', 'pathologyDiagnosis']
    .map(field => text(item[field])).filter(value => !missing(value));
  if (item.itemType === 'lab' && !item.reviewIssues?.length && narrative.every(value => normal.test(value))) {
    const value = text(item.value).normalize('NFKC');
    const range = text(item.referenceRange).normalize('NFKC');
    const numeric = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
    const bounds = range.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*[-~–—至]\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/);
    if (numeric.test(value) && bounds) {
      const number = Number(value), lower = Number(bounds[1]), upper = Number(bounds[2]);
      if (lower <= upper && number >= lower && number <= upper) return { ...item, status: 'normal' };
    }
  }
  const evidence = evidenceFields.map(field => text(item[field])).filter(value => !missing(value));
  if (!evidence.length) return item;
  // Only promote an explicit, standalone normal result. A mixed or qualified statement stays for review.
  return evidence.every(value => normal.test(value)) ? { ...item, status: 'normal' } : item;
}

function mergeCoverageAuditItems(originalItems, auditItems) {
  const result = (originalItems || []).map(item => ({ ...item }));
  for (const candidate of auditItems || []) {
    if (!key(candidate?.name) || !evidenceFields.some(field => !missing(candidate[field]))) continue;
    const matches = result.filter(old => key(old.name) === key(candidate.name)
      && Number(old.sourcePage || 1) === Number(candidate.sourcePage || 1)
      && (!key(old.sourceSection) || !key(candidate.sourceSection) || key(old.sourceSection) === key(candidate.sourceSection)));
    const incomplete = matches.find(old => evidenceFields.every(field => missing(old[field]))
      || (old.itemType === 'imaging' && missing(old.findings) && !missing(candidate.findings))
      || (old.itemType === 'imaging' && missing(old.findings) && !missing(candidate.value)));
    if (incomplete) {
      for (const field of evidenceFields) {
        if (!missing(incomplete[field]) || missing(candidate[field])) continue;
        if (field === 'value' && incomplete.itemType === 'imaging') incomplete.findings = text(candidate.value);
        else incomplete[field] = candidate[field];
      }
      if ((!text(incomplete.status) || incomplete.status === 'unknown') && candidate.status && candidate.status !== 'unknown') incomplete.status = candidate.status;
      continue;
    }
    if (matches.some(old => evidenceFields.every(field => key(old[field]) === key(candidate[field])))) continue;
    if (matches.length && matches.some(old => key(old.value) === key(candidate.value) && key(old.unit) === key(candidate.unit))) continue;
    result.push(candidate);
  }
  return result.map(normalizeExplicitNormalStatus);
}

function coverageAuditHasChanges(originalItems, mergedItems) {
  return JSON.stringify(originalItems || []) !== JSON.stringify(mergedItems || []);
}

module.exports = { mergeCoverageAuditItems, normalizeExplicitNormalStatus, coverageAuditHasChanges };
