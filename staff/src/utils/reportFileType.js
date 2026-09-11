const PDF_MIME_TYPES = new Set(['application/pdf', 'application/x-pdf'])

const reportFileHints = (report = {}, candidateUrl = '') => [
  candidateUrl,
  report.fileUrl,
  ...(Array.isArray(report.fileUrls) ? report.fileUrls : []),
  report.fileName,
  report.originalName,
  report.title,
].filter(Boolean).join(' ')

export const isPdfReportFile = (report = {}, candidateUrl = '') => {
  const mimeType = String(report.mimeType || '').toLowerCase().split(';')[0].trim()
  if (PDF_MIME_TYPES.has(mimeType)) return true
  if (String(candidateUrl).startsWith('data:application/pdf')) return true
  // 私有预览地址本身没有扩展名，因此还要参考原始 OSS 地址和显示文件名。
  return /\.pdf(?:$|[?#\s])/i.test(reportFileHints(report, candidateUrl))
}

export const isImageReportFile = (report = {}, candidateUrl = '') => {
  if (isPdfReportFile(report, candidateUrl)) return false
  const mimeType = String(report.mimeType || '').toLowerCase()
  if (mimeType.startsWith('image/')) return true
  if (String(candidateUrl).startsWith('data:image/')) return true
  return /\.(?:jpe?g|png|gif|webp|bmp|heic|heif)(?:$|[?#\s])/i.test(reportFileHints(report, candidateUrl))
}
