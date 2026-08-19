const REVIEW_SUBMISSION_STALE_MS = 10 * 60 * 1000;

function reviewSubmissionStaleBefore(now = new Date()) {
  return new Date(new Date(now).getTime() - REVIEW_SUBMISSION_STALE_MS);
}

function buildReviewSubmissionClaimFilter(reportId, extractionId = null, now = new Date(), revisionId = undefined) {
  const staleBefore = reviewSubmissionStaleBefore(now);
  const filter = {
    _id: reportId,
    currentExtractionId: extractionId || null,
    aiStatus: { $ne: 'processing' },
    'pageParseStatus.status': { $ne: 'processing' },
    $or: [
      { 'reviewSubmission.status': { $ne: 'processing' } },
      { 'reviewSubmission.startedAt': { $lte: staleBefore } },
      { 'reviewSubmission.startedAt': { $exists: false } },
    ],
  };
  if (revisionId !== undefined) filter.currentRevisionId = revisionId || null;
  return filter;
}

function buildReviewSubmissionOwnerFilter(reportId, claimId) {
  return { _id: reportId, 'reviewSubmission.claimId': String(claimId) };
}

module.exports = {
  REVIEW_SUBMISSION_STALE_MS,
  reviewSubmissionStaleBefore,
  buildReviewSubmissionClaimFilter,
  buildReviewSubmissionOwnerFilter,
};
