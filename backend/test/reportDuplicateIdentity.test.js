const test = require('node:test');
const assert = require('node:assert/strict');
const { sha256, reportDigest, unusedUploadKeys } = require('../src/utils/reportUploadIdentity');
const { eligibility } = require('../src/utils/annualReviewEligibility');

test('exact original bytes match across staff and customer upload paths; page order remains significant', () => {
  const first = sha256(Buffer.from('first scanned page'));
  const second = sha256(Buffer.from('second scanned page'));
  assert.equal(reportDigest([{ sha256: first }]), first);
  assert.notEqual(reportDigest([{ sha256: first }, { sha256: second }]), reportDigest([{ sha256: second }, { sha256: first }]));
  assert.equal(reportDigest([{ sha256: first }, { sha256: '' }]), '');
});

test('a retry with the original upload token never deletes the retained report file', () => {
  const existing = { ossKey: 'original', ossKeys: ['original', 'page-2'] };
  assert.deepEqual(unusedUploadKeys(existing, [{ ossKey: 'original' }, { ossKey: 'new-duplicate' }], ['page-2', 'new-page']), ['new-duplicate', 'new-page']);
});

test('a duplicate-only report cannot satisfy annual exam eligibility', () => {
  const report = { _id: 'duplicate', audit_status: 'audited', archiveOnly: true, title: '年度体检报告', documentCategory: 'physical_exam', checkDate: '2026-10-10', reportItems: [{ name: '肝脏超声' }] };
  assert.equal(eligibility([report], new Date('2026-10-24T00:00:00Z')).allowed, false);
});
