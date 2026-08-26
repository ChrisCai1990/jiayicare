const clean = value => String(value == null ? '' : value).toLowerCase().replace(/[\s，,、:：;；()（）\[\]【】\-_/]/g, '');

function canonicalReportItemName(value) {
  return clean(value)
    .replace(/彩色多普勒超声检查|彩色多普勒超声|彩超|b超|超声检查/g, '超声')
    .replace(/计算机断层扫描|ct检查/g, 'ct')
    .replace(/磁共振成像|核磁共振|mri检查/g, 'mri')
    .replace(/电子胃镜检查/g, '胃镜')
    .replace(/电子肠镜检查|电子结肠镜检查/g, '肠镜');
}

function supplementIdentity(item) {
  return `${String(item?.itemType || '')}|${canonicalReportItemName(item?.name)}|${canonicalReportItemName(item?.bodyPart)}`;
}

function hasImagingEvidence(item) {
  if (item?.itemType !== 'imaging') return true;
  const evidence = clean(item?.sourceEvidence);
  if (!evidence) return false;
  const name = canonicalReportItemName(item?.name);
  const bodyPart = canonicalReportItemName(item?.bodyPart);
  if (name && !evidence.includes(name) && (!bodyPart || !evidence.includes(bodyPart))) return false;
  const result = clean(item?.diagnosis || item?.conclusion || item?.findings);
  if (!result) return false;
  const proof = result.length > 20 ? result.slice(0, 20) : result;
  return proof.length >= 2 && evidence.includes(proof);
}

function filterSupplementCandidates(existingItems, candidateItems) {
  const identities = new Set((existingItems || []).map(supplementIdentity));
  const accepted = [];
  for (const item of (candidateItems || [])) {
    if (!String(item?.name || '').trim()) continue;
    const identity = supplementIdentity(item);
    if (identities.has(identity) || !hasImagingEvidence(item)) continue;
    identities.add(identity);
    accepted.push(item);
  }
  return accepted;
}

module.exports = { canonicalReportItemName, supplementIdentity, hasImagingEvidence, filterSupplementCandidates };
