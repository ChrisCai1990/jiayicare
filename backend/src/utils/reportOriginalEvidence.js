function plain(value) {
  return value?.toObject ? value.toObject() : (value || {});
}

function normalizeSha256(value) {
  const hash = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : '';
}

function buildReportSourceFiles(files) {
  return (Array.isArray(files) ? files : []).map(value => {
    const file = plain(value);
    return {
      ossKey: String(file.ossKey || '').trim(),
      sha256: normalizeSha256(file.sha256),
      mimeType: String(file.mimeType || '').trim().toLowerCase(),
      fileSize: Math.max(0, Number(file.fileSize || 0)),
    };
  }).filter(file => file.ossKey);
}

function reportHasOriginal(report) {
  return Boolean(
    report?.fileUrl
    || report?.ossKey
    || report?.fileUrls?.length
    || report?.ossKeys?.length
    || report?.sourceFiles?.length
  );
}

function summarizeReportOriginalEvidence(files, fallbackOssKeys = []) {
  const normalized = buildReportSourceFiles(files);
  const hashes = normalized.map(file => file.sha256).filter(Boolean);
  const fallbackKeys = (Array.isArray(fallbackOssKeys) ? fallbackOssKeys : []).map(String).filter(Boolean);
  const identityParts = hashes.length === normalized.length && hashes.length
    ? hashes
    : fallbackKeys;
  return {
    fileCount: normalized.length || fallbackKeys.length,
    verifiedCount: hashes.length,
    status: normalized.length && hashes.length === normalized.length ? 'verified' : (hashes.length ? 'partial' : 'legacy'),
    fingerprints: hashes.map(hash => hash.slice(0, 12)),
    identity: identityParts.length
      ? crypto.createHash('sha256').update(JSON.stringify(identityParts)).digest('hex')
      : '',
  };
}

function compareReportOriginalEvidence(leftFiles, rightFiles, leftFallbackKeys = [], rightFallbackKeys = []) {
  const left = summarizeReportOriginalEvidence(leftFiles, leftFallbackKeys);
  const right = summarizeReportOriginalEvidence(rightFiles, rightFallbackKeys);
  return {
    left,
    right,
    comparable: Boolean(left.identity && right.identity),
    same: Boolean(left.identity && right.identity && left.identity === right.identity),
  };
}

function toSafeVersionOriginalEvidence(value) {
  const obj = value?.toObject ? value.toObject() : { ...(value || {}) };
  const source = { ...(obj.source || {}) };
  source.originalEvidence = summarizeReportOriginalEvidence(source.files, source.ossKeys);
  delete source.files;
  delete source.ossKeys;
  obj.source = source;
  return obj;
}

module.exports = {
  buildReportSourceFiles,
  reportHasOriginal,
  summarizeReportOriginalEvidence,
  compareReportOriginalEvidence,
  toSafeVersionOriginalEvidence,
};
const crypto = require('crypto');
