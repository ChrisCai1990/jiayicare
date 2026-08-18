const test = require('node:test');
const assert = require('node:assert/strict');
const { assertReportFileBuffer, assertVerifiedReportOriginals } = require('../src/utils/reportUploadPolicy');

test('medical staff cannot create an upload report without a verified original', () => {
  assert.throws(() => assertVerifiedReportOriginals([]), /先上传报告原件/);
});

test('verified PDF, common images and iPhone HEIC originals are accepted', () => {
  const files = [{ mimeType: 'application/pdf' }, { mimeType: 'image/jpeg' }, { mimeType: 'image/heic' }];
  assert.equal(assertVerifiedReportOriginals(files), files);
});

test('a signed token cannot make an unsupported file type acceptable', () => {
  assert.throws(() => assertVerifiedReportOriginals([{ mimeType: 'text/html' }]), /不支持的文件格式/);
});

test('medical report upload verifies file signatures instead of trusting browser MIME', () => {
  assert.equal(assertReportFileBuffer(Buffer.from('%PDF-1.7\n'), 'application/pdf'), 'application/pdf');
  assert.equal(assertReportFileBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'), 'image/jpeg');
  assert.throws(
    () => assertReportFileBuffer(Buffer.from('<script>alert(1)</script>'), 'application/pdf'),
    /文件内容无法识别/,
  );
  assert.throws(
    () => assertReportFileBuffer(Buffer.from('%PDF-1.7\n'), 'image/png'),
    /声明格式不一致/,
  );
});

test('HEIC and BMP signatures remain supported after content verification', () => {
  const heic = Buffer.alloc(16);
  heic.write('ftyp', 4, 'ascii');
  heic.write('heic', 8, 'ascii');
  assert.equal(assertReportFileBuffer(heic, 'image/heif'), 'image/heif');
  assert.equal(assertReportFileBuffer(Buffer.from([0x42, 0x4d, 0, 0]), 'image/bmp'), 'image/bmp');
});
