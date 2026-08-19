const OCR_RUN_STALE_MS = 30 * 60 * 1000;
const { reviewSubmissionStaleBefore } = require('./reportReviewRun');

function ocrRunStaleBefore(now = new Date()) {
  return new Date(new Date(now).getTime() - OCR_RUN_STALE_MS);
}

function buildFullOcrClaimFilter(reportId, now = new Date()) {
  const staleBefore = ocrRunStaleBefore(now);
  const staleReviewBefore = reviewSubmissionStaleBefore(now);
  return {
    _id: reportId,
    $and: [
      {
        $or: [
          { aiStatus: { $ne: 'processing' } },
          { 'ocrProgress.updatedAt': { $lte: staleBefore } },
          { 'ocrProgress.updatedAt': { $exists: false } },
        ],
      },
      {
        $or: [
          { 'reviewSubmission.status': { $ne: 'processing' } },
          { 'reviewSubmission.startedAt': { $lte: staleReviewBefore } },
          { 'reviewSubmission.startedAt': { $exists: false } },
        ],
      },
      {
        $or: [
          { 'pageParseStatus.status': { $ne: 'processing' } },
          { 'pageParseStatus.startedAt': { $lte: staleBefore } },
          { 'pageParseStatus.startedAt': { $exists: false } },
        ],
      },
    ],
  };
}

function buildPageOcrClaimFilter(reportId, now = new Date()) {
  const staleBefore = ocrRunStaleBefore(now);
  const staleReviewBefore = reviewSubmissionStaleBefore(now);
  return {
    _id: reportId,
    aiStatus: { $ne: 'processing' },
    $and: [
      { $or: [
        { 'pageParseStatus.status': { $ne: 'processing' } },
        { 'pageParseStatus.startedAt': { $lte: staleBefore } },
        { 'pageParseStatus.startedAt': { $exists: false } },
      ] },
      { $or: [
        { 'reviewSubmission.status': { $ne: 'processing' } },
        { 'reviewSubmission.startedAt': { $lte: staleReviewBefore } },
        { 'reviewSubmission.startedAt': { $exists: false } },
      ] },
    ],
  };
}

function buildOcrRunOwnerFilter(reportId, runId) {
  return runId
    ? { _id: reportId, 'ocrProgress.runId': String(runId) }
    : { _id: reportId };
}

function buildPageOcrRunOwnerFilter(reportId, runId) {
  return runId
    ? { _id: reportId, 'pageParseStatus.runId': String(runId) }
    : { _id: reportId };
}

module.exports = {
  OCR_RUN_STALE_MS,
  ocrRunStaleBefore,
  buildFullOcrClaimFilter,
  buildPageOcrClaimFilter,
  buildOcrRunOwnerFilter,
  buildPageOcrRunOwnerFilter,
};
