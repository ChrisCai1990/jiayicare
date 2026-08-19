const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const MedicalReport = require('../src/models/MedicalReport');
const ReportExtraction = require('../src/models/ReportExtraction');
const ReportRevision = require('../src/models/ReportRevision');
const { buildReportSourceFiles, mergeReportSourceFiles, reportHasOriginal, summarizeReportOriginalEvidence, compareReportOriginalEvidence, toSafeVersionOriginalEvidence } = require('../src/utils/reportOriginalEvidence');

const fileEvidence = {
  ossKey: 'reports/original.pdf',
  sha256: 'd'.repeat(64),
  mimeType: 'application/pdf',
  fileSize: 45678,
};

test('report, extraction and reviewed revision can retain the same original-file evidence', () => {
  const reportId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const report = new MedicalReport({
    _id: reportId,
    user: userId,
    title: '年度体检报告',
    sourceFiles: [fileEvidence],
  });
  const extraction = new ReportExtraction({
    reportId,
    user: userId,
    version: 1,
    source: { ossKeys: [fileEvidence.ossKey], files: [fileEvidence], pageCount: 28 },
  });
  const revision = new ReportRevision({
    reportId,
    extractionId: extraction._id,
    user: userId,
    revisionNo: 1,
    contentHash: 'content-hash',
    review: { reviewedAt: new Date(), action: 'submit' },
    source: { extractionVersion: 1, ocrVersion: 'v3', files: [fileEvidence] },
  });

  assert.equal(report.validateSync(), undefined);
  assert.equal(extraction.validateSync(), undefined);
  assert.equal(revision.validateSync(), undefined);
  assert.equal(report.sourceFiles[0].sha256, fileEvidence.sha256);
  assert.equal(extraction.source.files[0].sha256, fileEvidence.sha256);
  assert.equal(revision.source.files[0].sha256, fileEvidence.sha256);
});

test('original evidence is normalized and invalid hashes are never presented as verified', () => {
  assert.deepEqual(buildReportSourceFiles([{ ...fileEvidence, sha256: fileEvidence.sha256.toUpperCase() }]), [fileEvidence]);
  assert.equal(buildReportSourceFiles([{ ...fileEvidence, sha256: 'not-a-hash' }])[0].sha256, '');
  assert.equal(reportHasOriginal({ sourceFiles: [fileEvidence] }), true);
  assert.equal(reportHasOriginal({ fileUrls: [], ossKeys: [], sourceFiles: [] }), false);
});

test('appending original evidence preserves order and never duplicates an OSS object', () => {
  const second = { ...fileEvidence, ossKey: 'reports/page-2.pdf', sha256: 'e'.repeat(64) };
  assert.deepEqual(mergeReportSourceFiles([fileEvidence], [fileEvidence, second]), [fileEvidence, second]);
});

test('report preview rotation is display metadata with a bounded quarter-turn value', () => {
  const valid = new MedicalReport({ user: new mongoose.Types.ObjectId(), title: '图片报告', displayRotation: 270 });
  const invalid = new MedicalReport({ user: new mongoose.Types.ObjectId(), title: '图片报告', displayRotation: 45 });
  assert.equal(valid.validateSync(), undefined);
  assert.match(invalid.validateSync().errors.displayRotation.message, /not a valid enum value/);
});

test('staff audit receives comparable fingerprints without OSS object paths', () => {
  const current = summarizeReportOriginalEvidence([fileEvidence]);
  const extraction = summarizeReportOriginalEvidence([fileEvidence]);
  const legacy = summarizeReportOriginalEvidence([], ['reports/legacy.pdf']);
  assert.equal(current.status, 'verified');
  assert.deepEqual(current.fingerprints, [fileEvidence.sha256.slice(0, 12)]);
  assert.equal(current.identity, extraction.identity);
  assert.equal(legacy.status, 'legacy');
  assert.equal(legacy.fingerprints.length, 0);
  assert.equal(JSON.stringify(current).includes(fileEvidence.ossKey), false);
});

test('original consistency comparison fails closed for a different or missing OCR source', () => {
  const same = compareReportOriginalEvidence([fileEvidence], [fileEvidence]);
  const changed = compareReportOriginalEvidence([fileEvidence], [{ ...fileEvidence, sha256: 'f'.repeat(64) }]);
  const missing = compareReportOriginalEvidence([fileEvidence], []);
  assert.equal(same.comparable, true);
  assert.equal(same.same, true);
  assert.equal(changed.same, false);
  assert.equal(missing.comparable, false);
  assert.equal(missing.same, false);
});

test('version audit response exposes fingerprints but not OSS paths or source manifests', () => {
  const safe = toSafeVersionOriginalEvidence({
    version: 2,
    source: { ossKeys: [fileEvidence.ossKey], files: [fileEvidence], pageCount: 28 },
  });
  assert.equal(safe.version, 2);
  assert.equal(safe.source.pageCount, 28);
  assert.equal(safe.source.originalEvidence.status, 'verified');
  assert.equal('files' in safe.source, false);
  assert.equal('ossKeys' in safe.source, false);
  assert.equal(JSON.stringify(safe).includes(fileEvidence.ossKey), false);
});
