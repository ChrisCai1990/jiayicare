const crypto = require('crypto');

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const validDigest = value => /^[a-f0-9]{64}$/.test(String(value || ''));

// A single-page report shares its identity with the staff upload path. For a
// multi-page report, page order and boundaries are part of the identity.
function reportDigest(files) {
  const digests = files.map(file => file.sha256);
  if (!digests.length || !digests.every(validDigest)) return '';
  if (digests.length === 1) return digests[0];
  return sha256(Buffer.from(`report-pages-v1:${digests.length}:${digests.join(':')}`));
}

function unusedUploadKeys(existing, verifiedFiles, newKeys) {
  const retained = new Set([existing.ossKey, ...(existing.ossKeys || [])].filter(Boolean));
  return [...verifiedFiles.map(file => file.ossKey), ...newKeys].filter(key => key && !retained.has(key));
}

module.exports = { sha256, validDigest, reportDigest, unusedUploadKeys };
