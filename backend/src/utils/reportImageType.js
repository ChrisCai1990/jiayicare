// Older report uploads can have a valid image URL without a stored MIME type.
function isImageReport(report) {
  if (report.mimeType?.startsWith('image/')) return true;
  if (report.mimeType) return false;
  const url = report.fileUrl || report.fileUrls?.[0] || '';
  return /\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(url)
    || /^data:image\/(?:jpeg|png|webp);base64,/i.test(report.content || '');
}

module.exports = { isImageReport };
