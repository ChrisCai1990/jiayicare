const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const MedicalReport = require('../src/models/MedicalReport');
const ReportExtraction = require('../src/models/ReportExtraction');
const ReportRevision = require('../src/models/ReportRevision');
const { buildReportSourceFiles, reportHasOriginal } = require('../src/utils/reportOriginalEvidence');

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
