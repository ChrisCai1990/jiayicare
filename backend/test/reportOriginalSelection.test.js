const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { fetchReportBuffer } = require('../src/utils/pdf');

test('registered original evidence takes precedence over legacy Base64 content for OCR', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiayicare-original-'));
  const filename = 'report.bin';
  const original = Buffer.from('stored-original');
  fs.writeFileSync(path.join(dir, filename), original);
  try {
    const selected = await fetchReportBuffer({
      sourceFiles: [{ ossKey: `reports/${filename}`, sha256: 'e'.repeat(64) }],
      fileUrl: `/api/uploads/${filename}`,
      content: `data:application/octet-stream;base64,${Buffer.from('derived-preview').toString('base64')}`,
    }, dir);
    assert.deepEqual(selected, original);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy Base64-only reports remain readable', async () => {
  const expected = Buffer.from('legacy-report');
  const selected = await fetchReportBuffer({
    content: `data:application/octet-stream;base64,${expected.toString('base64')}`,
  }, os.tmpdir());
  assert.deepEqual(selected, expected);
});
