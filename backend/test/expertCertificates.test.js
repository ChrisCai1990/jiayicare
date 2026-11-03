const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../src/utils/expertCertificates');
const oss = require('../src/utils/oss');
const { normalizeLanguages } = require('../../shared/expertQualifications.cjs');
const { appendCertificateFiles } = require('../../shared/expertCertificateQueue.cjs');
test('repair multipart filename encoding without corrupting valid Chinese and accented names', () => {
  const name = '吴医生-执业证与毕业证.png';
  assert.equal(storage.normalizeName(Buffer.from(name).toString('latin1')), name);
  assert.equal(storage.normalizeName(name), name);
  assert.equal(storage.normalizeName('résumé.pdf'), 'résumé.pdf');
  assert.equal(storage.normalizeName('certificate.pdf'), 'certificate.pdf');
});
test('repeated file selection appends files and preserves the category selected for each batch', () => {
  const first = { name: '证书.jpg', size: 123, lastModified: 1 };
  const second = { name: '证书背面.jpg', size: 124, lastModified: 2 };
  const original = appendCertificateFiles([], [first], 'qualification');
  const appended = appendCertificateFiles(original, [second], 'practice');
  assert.equal(original.length, 1);
  assert.deepEqual(appended.map(x => x.category), ['qualification', 'practice']);
  assert.equal(appendCertificateFiles(appended, [], 'degree').length, 2);
  assert.equal(appendCertificateFiles(appended, [first], 'qualification').length, 2);
  assert.equal(appendCertificateFiles(appended, [first], 'degree').length, 3);
});
test('certificate objects explicitly use private ACL without exposing an object URL', async t => {
  const original = oss.getClient;
  let captured;
  oss.getClient = () => ({ put: async (...args) => { captured = args; } });
  t.after(() => { oss.getClient = original; });
  const saved = await storage.store({ buffer: Buffer.from('%PDF-1.4\nsynthetic') }, { tenantId: 'tenant', _id: 'recruitment' });
  assert.match(captured[0], /^expert-certificates\/tenant\/recruitment\/.+\.pdf$/);
  assert.equal(captured[2].headers['x-oss-object-acl'], 'private');
  assert.equal(saved.url, undefined);
  assert.throws(() => storage.fileType(Buffer.from('<html>fake pdf</html>')));
});
test('language capabilities retain translation needs and reject duplicates and invalid levels', () => {
  assert.deepEqual(normalizeLanguages([{ language: ' 英语 ', level: 'interpreter' }]), [{ language: '英语', level: 'interpreter' }]);
  assert.deepEqual(normalizeLanguages(undefined), []);
  assert.throws(() => normalizeLanguages([{ language: '英语', level: 'consultation' }, { language: '英语', level: 'reading' }]));
  assert.throws(() => normalizeLanguages([{ language: '英语', level: 'fluent' }]));
});
