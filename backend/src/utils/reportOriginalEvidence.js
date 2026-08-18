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

module.exports = { buildReportSourceFiles, reportHasOriginal };
