function canDirectlyApproveReport(aiStatus) {
  const status = String(aiStatus || '').trim();
  return !status || status === 'none' || status === 'reviewed';
}

function validateOcrReviewTransition({ aiStatus, reviewAction, reviewRequestId } = {}) {
  if (aiStatus === 'reviewed' && reviewAction !== 'submit') {
    return '正式发布 OCR 结果必须使用提交审核动作';
  }
  if (reviewAction === 'submit' && aiStatus !== 'reviewed') {
    return '提交审核时报告状态必须为已复核';
  }
  if (['submit', 'reject'].includes(reviewAction) && !String(reviewRequestId || '').trim()) {
    return '正式审核动作缺少请求标识，请刷新后重试';
  }
  return '';
}

function validateManualAuditAction(action, reviewRequestId) {
  if (!['approve', 'reject'].includes(action)) return '无效的报告审核动作';
  if (!String(reviewRequestId || '').trim()) return '正式审核动作缺少请求标识，请刷新后重试';
  return '';
}

function validateOcrVersionBinding({ ocrVersion, currentExtractionId, extractionExists = true } = {}) {
  if (!String(ocrVersion || '').trim()) return '';
  if (!currentExtractionId) return '当前 OCR 草稿缺少识别版本记录，请重新识别后再提交审核';
  if (!extractionExists) return '当前识别版本引用已失效，请重新识别后再提交审核';
  return '';
}

module.exports = {
  canDirectlyApproveReport,
  validateOcrReviewTransition,
  validateManualAuditAction,
  validateOcrVersionBinding,
};
