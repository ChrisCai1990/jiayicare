const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const ReportRevision = require('../src/models/ReportRevision');
const ReportReviewEvent = require('../src/models/ReportReviewEvent');

const ids = () => ({
  reportId: new mongoose.Types.ObjectId(),
  user: new mongoose.Types.ObjectId(),
  reviewerId: new mongoose.Types.ObjectId(),
});

test('a new published revision requires server audit identity and time', () => {
  const { reportId, user } = ids();
  const revision = new ReportRevision({
    reportId, user, revisionNo: 1, contentHash: 'hash', items: [],
  });

  assert.match(revision.validateSync().message, /review/);
});

test('revision audit stores an actor snapshot and OCR source version', () => {
  const { reportId, user, reviewerId } = ids();
  const reviewedAt = new Date('2026-08-19T08:00:00.000Z');
  const revision = new ReportRevision({
    reportId, user, revisionNo: 1, contentHash: 'hash', items: [],
    review: {
      reviewerId, reviewerName: '审核员甲', reviewerRole: 'healthManager',
      reviewedAt, action: 'submit', auditStatus: 'audited',
    },
    source: { extractionVersion: 3, extractionOrigin: 'ocr', ocrVersion: 'v2' },
  });

  assert.equal(revision.validateSync(), undefined);
  assert.equal(revision.review.reviewerName, '审核员甲');
  assert.equal(revision.source.extractionVersion, 3);
});

test('review events use a report-scoped request id for retry idempotency', () => {
  const indexes = ReportReviewEvent.schema.indexes();
  const requestIndex = indexes.find(([fields]) => fields.reportId === 1 && fields.requestId === 1);

  assert.ok(requestIndex);
  assert.equal(requestIndex[1].unique, true);
});

test('a rejection is auditable before any published revision exists', () => {
  const { reportId, user, reviewerId } = ids();
  const event = new ReportReviewEvent({
    reportId,
    reportRevisionId: null,
    user,
    requestId: 'reject-request-1',
    action: 'reject',
    source: 'ocr_review',
    actor: { id: reviewerId, name: '审核员乙', role: 'healthManager' },
    occurredAt: new Date('2026-08-19T09:00:00.000Z'),
    contentHash: 'rejected-content-hash',
    result: 'rejected',
  });

  assert.equal(event.validateSync(), undefined);
  assert.equal(event.reportRevisionId, null);
  assert.equal(event.action, 'reject');
});

test('an integrity repair is recorded against the published revision', () => {
  const { reportId, user, reviewerId } = ids();
  const event = new ReportReviewEvent({
    reportId,
    reportRevisionId: new mongoose.Types.ObjectId(),
    user,
    requestId: 'reconcile-request-1',
    action: 'reconcile',
    source: 'integrity_repair',
    actor: { id: reviewerId, name: '审核员丙', role: 'healthManager' },
    occurredAt: new Date(),
    contentHash: 'published-content-hash',
    result: 'reconciled',
  });
  assert.equal(event.validateSync(), undefined);
});
