const clean = value => String(value || '').trim();
const same = (a, b) => clean(a).normalize('NFKC').replace(/\s+/g, '').toLowerCase()
  === clean(b).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const medicineName = value => clean(value).normalize('NFKC')
  .replace(/^\d+[.)、]\s*/, '').replace(/^\[[^\]]+\]/, '').replace(/\s+/g, '').toLowerCase();
const isScale = item => /GAD\s*[-－]?\s*7|PHQ\s*[-－]?\s*9|广泛性焦虑障碍量表|焦虑自评量表|抑郁自评量表/i.test(clean(item?.name));
const isTotalRange = value => /^0\s*[～~至\-–—]\s*\d+$/.test(clean(value).normalize('NFKC'));

function mergePrescriptionReview(items, reviewed) {
  return (items || []).map(item => {
    if (item.itemType !== 'medication') return item;
    const matches = (reviewed || []).filter(candidate =>
      medicineName(candidate.genericName || candidate.name) === medicineName(item.genericName || item.name)
      && (!clean(item.examDate) || same(candidate.examDate, item.examDate)));
    // Repeated drugs on different slips must never borrow each other's instructions.
    if (matches.length !== 1) return item;
    const candidate = matches[0];
    return {
      ...item,
      referenceRange: clean(item.referenceRange) || clean(candidate.referenceRange),
      findings: clean(item.findings) || clean(candidate.findings),
      reviewIssues: [...new Set([...(item.reviewIssues || []), ...(candidate.reviewIssues || [])])],
    };
  });
}

function needsScaleReferenceReview(items) {
  return (items || []).some(item =>
    isScale(item) && (!clean(item.referenceRange) || isTotalRange(item.referenceRange)));
}

function mergeScaleReferenceReview(items, reviewed) {
  return (items || []).map(item => {
    if (!isScale(item)) return item;
    const matches = (reviewed || []).filter(candidate =>
      same(candidate.name, item.name) && same(candidate.value, item.value)
      && clean(candidate.referenceRange)
      && !isTotalRange(candidate.referenceRange));
    const current = clean(item.referenceRange).normalize('NFKC');
    if (current && !isTotalRange(current)) return item;
    if (matches.length !== 1) return isTotalRange(current)
      ? { ...item, referenceRange: '', reviewIssues: [...new Set([...(item.reviewIssues || []), '原识别为量表总分范围，正常参考值待核对'])] }
      : item;
    return { ...item, referenceRange: clean(matches[0].referenceRange) };
  });
}

module.exports = { mergePrescriptionReview, needsScaleReferenceReview, mergeScaleReferenceReview };
