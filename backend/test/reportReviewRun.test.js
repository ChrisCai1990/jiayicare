const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REVIEW_SUBMISSION_STALE_MS,
  reviewSubmissionStaleBefore,
  buildReviewSubmissionClaimFilter,
  buildReviewSubmissionOwnerFilter,
} = require('../src/utils/reportReviewRun');

test('formal review submission has a bounded recovery lease', () => {
  const now = new Date('2026-08-19T06:00:00.000Z');
  assert.equal(REVIEW_SUBMISSION_STALE_MS, 10 * 60 * 1000);
  assert.equal(reviewSubmissionStaleBefore(now).toISOString(), '2026-08-19T05:50:00.000Z');
});

test('review claim is bound to the exact extraction and excludes OCR writes', () => {
  const filter = buildReviewSubmissionClaimFilter('report-1', 'extraction-3', new Date('2026-08-19T06:00:00.000Z'), 'revision-2');
  assert.equal(filter.currentExtractionId, 'extraction-3');
  assert.equal(filter.currentRevisionId, 'revision-2');
  assert.deepEqual(filter.aiStatus, { $ne: 'processing' });
  assert.deepEqual(filter['pageParseStatus.status'], { $ne: 'processing' });
  assert.deepEqual(filter.$or[1], { 'reviewSubmission.startedAt': { $lte: new Date('2026-08-19T05:50:00.000Z') } });
});

test('review completion and failure cleanup are scoped to the winning claim', () => {
  assert.deepEqual(buildReviewSubmissionOwnerFilter('report-1', 'claim-1'), {
    _id: 'report-1',
    'reviewSubmission.claimId': 'claim-1',
  });
});
