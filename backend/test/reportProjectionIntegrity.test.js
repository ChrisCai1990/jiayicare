const test = require('node:test');
const assert = require('node:assert/strict');
const { assessReportProjectionIntegrity } = require('../src/utils/reportProjectionIntegrity');

const revision = {
  _id: 'revision-2',
  review: { action: 'submit' },
  items: [
    { sourceItemId: 'item-1', name: '血糖', matchStatus: 'matched', screeningKey: 'chronic|糖尿病|血糖' },
    { sourceItemId: 'item-2', name: '新项目', matchStatus: 'unclassified' },
  ],
};

test('an unpublished report has no derived-data inconsistency yet', () => {
  const result = assessReportProjectionIntegrity();
  assert.equal(result.status, 'not_published');
  assert.equal(result.consistent, true);
});

test('manual audit does not falsely require legacy matched-item projection', () => {
  const manualRevision = { ...revision, review: { action: 'approve' }, items: [revision.items[0]] };
  const result = assessReportProjectionIntegrity({
    revision: manualRevision,
    reviewEvents: [{ reportRevisionId: 'revision-2', action: 'approve', source: 'manual_audit', result: 'published' }],
  });
  assert.equal(result.consistent, true);
  assert.equal(result.projectionMode, 'manual_audit');
  assert.equal(result.expectedProjectionCount, 0);
});

test('a published revision is consistent when audit, candidates and projections agree', () => {
  const result = assessReportProjectionIntegrity({
    revision,
    reviewEvents: [{ reportRevisionId: 'revision-2', action: 'submit', source: 'ocr_review', result: 'published' }],
    candidates: [{ sourceItemId: 'item-2', status: 'pending' }],
    projections: [{ itemId: 'chronic|糖尿病|血糖', reportRevisionId: 'revision-2' }],
  });
  assert.equal(result.status, 'consistent');
  assert.equal(result.reviewEventCount, 1);
});

test('new revisions require an activation event for every current projection', () => {
  const auditedRevision = { ...revision, projectionAuditVersion: 'v1' };
  const base = {
    revision: auditedRevision,
    reviewEvents: [{ reportRevisionId: 'revision-2', action: 'submit', source: 'ocr_review', result: 'published' }],
    candidates: [{ sourceItemId: 'item-2', status: 'pending' }],
    projections: [{ itemId: 'chronic|糖尿病|血糖', reportRevisionId: 'revision-2' }],
  };
  const missing = assessReportProjectionIntegrity(base);
  assert.equal(missing.consistent, false);
  assert.deepEqual(missing.missingProjectionEventKeys, ['chronic|糖尿病|血糖']);

  const complete = assessReportProjectionIntegrity({
    ...base,
    projectionEvents: [{ reportRevisionId: 'revision-2', itemId: 'chronic|糖尿病|血糖', action: 'activated' }],
  });
  assert.equal(complete.consistent, true);
  assert.equal(complete.projectionEventCount, 1);
});

test('resolved candidates become expected projections and dismissed candidates do not', () => {
  const result = assessReportProjectionIntegrity({
    revision,
    reviewEvents: [{ reportRevisionId: 'revision-2', action: 'submit', source: 'ocr_review', result: 'deduplicated' }],
    candidates: [{ sourceItemId: 'item-2', status: 'resolved', resolvedScreeningKey: 'other|其他|新项目' }],
    projections: [
      { itemId: 'chronic|糖尿病|血糖', reportRevisionId: 'revision-2' },
      { itemId: 'other|其他|新项目', reportRevisionId: 'revision-2' },
    ],
  });
  assert.equal(result.consistent, true);
  assert.equal(result.expectedProjectionCount, 2);
});

test('a reconcile event records repair but cannot replace original review evidence', () => {
  const result = assessReportProjectionIntegrity({
    revision,
    reviewEvents: [{ reportRevisionId: 'revision-2', action: 'reconcile', source: 'integrity_repair', result: 'reconciled' }],
    candidates: [{ sourceItemId: 'item-2', status: 'pending' }],
    projections: [{ itemId: 'chronic|糖尿病|血糖', reportRevisionId: 'revision-2' }],
  });
  assert.equal(result.consistent, false);
  assert.equal(result.reviewEventCount, 0);
});

test('missing audit events and stale or missing derived records are reported precisely', () => {
  const result = assessReportProjectionIntegrity({
    revision,
    candidates: [{ sourceItemId: 'stale-item', status: 'pending' }],
    projections: [
      { itemId: 'stale|category|item', reportRevisionId: 'revision-1' },
    ],
  });
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.missingCandidateSourceItemIds, ['item-2']);
  assert.deepEqual(result.staleCandidateSourceItemIds, ['stale-item']);
  assert.deepEqual(result.missingProjectionKeys, ['chronic|糖尿病|血糖']);
  assert.deepEqual(result.staleProjectionKeys, ['stale|category|item']);
  assert.deepEqual(result.wrongRevisionProjectionKeys, ['stale|category|item']);
});
