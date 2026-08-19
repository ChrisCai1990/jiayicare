const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OCR_RUN_STALE_MS,
  OCR_RUN_WARNING_MS,
  ocrRunStaleBefore,
  describeOcrRun,
  buildFullOcrClaimFilter,
  buildPageOcrClaimFilter,
  buildOcrRunOwnerFilter,
  buildPageOcrRunOwnerFilter,
} = require('../src/utils/reportOcrRun');

test('OCR run leases use a bounded recovery window', () => {
  const now = new Date('2026-08-19T06:00:00.000Z');
  assert.equal(OCR_RUN_STALE_MS, 30 * 60 * 1000);
  assert.equal(OCR_RUN_WARNING_MS, 10 * 60 * 1000);
  assert.equal(ocrRunStaleBefore(now).toISOString(), '2026-08-19T05:30:00.000Z');
});

test('OCR runtime distinguishes active, delayed, and safely retryable runs', () => {
  const now = new Date('2026-08-19T06:00:00.000Z');
  assert.deepEqual(describeOcrRun({ elapsedMs: 100000, updatedAt: '2026-08-19T05:58:00.000Z' }, now), {
    estimatedElapsedMs: 220000,
    inactiveMs: 120000,
    warning: false,
    retryAllowed: false,
  });

  const delayed = describeOcrRun({ elapsedMs: 0, updatedAt: '2026-08-19T05:49:00.000Z' }, now);
  assert.equal(delayed.warning, true);
  assert.equal(delayed.retryAllowed, false);

  const expired = describeOcrRun({ elapsedMs: 0, updatedAt: '2026-08-19T05:29:00.000Z' }, now);
  assert.equal(expired.warning, true);
  assert.equal(expired.retryAllowed, true);
});

test('OCR run without a progress timestamp can be safely reclaimed', () => {
  assert.deepEqual(describeOcrRun({ elapsedMs: 1200 }, new Date('2026-08-19T06:00:00.000Z')), {
    estimatedElapsedMs: 1200,
    inactiveMs: null,
    warning: true,
    retryAllowed: true,
  });
});

test('full OCR atomically excludes active full and page OCR runs', () => {
  const filter = buildFullOcrClaimFilter('report-1', new Date('2026-08-19T06:00:00.000Z'));
  assert.equal(filter._id, 'report-1');
  assert.equal(filter.$and.length, 3);
  assert.deepEqual(filter.$and[0].$or[1], { 'ocrProgress.updatedAt': { $lte: new Date('2026-08-19T05:30:00.000Z') } });
  assert.deepEqual(filter.$and[1].$or[1], { 'reviewSubmission.startedAt': { $lte: new Date('2026-08-19T05:50:00.000Z') } });
  assert.deepEqual(filter.$and[2].$or[1], { 'pageParseStatus.startedAt': { $lte: new Date('2026-08-19T05:30:00.000Z') } });
});

test('page OCR atomically excludes a full OCR run and another active page run', () => {
  const filter = buildPageOcrClaimFilter('report-1', new Date('2026-08-19T06:00:00.000Z'));
  assert.deepEqual(filter.aiStatus, { $ne: 'processing' });
  assert.deepEqual(filter.$and[0].$or[1], { 'pageParseStatus.startedAt': { $lte: new Date('2026-08-19T05:30:00.000Z') } });
  assert.deepEqual(filter.$and[1].$or[1], { 'reviewSubmission.startedAt': { $lte: new Date('2026-08-19T05:50:00.000Z') } });
});

test('late OCR writes are scoped to their own run id', () => {
  assert.deepEqual(buildOcrRunOwnerFilter('report-1', 'run-1'), { _id: 'report-1', 'ocrProgress.runId': 'run-1' });
  assert.deepEqual(buildPageOcrRunOwnerFilter('report-1', 'page-run-1'), { _id: 'report-1', 'pageParseStatus.runId': 'page-run-1' });
});
