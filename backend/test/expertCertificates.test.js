const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../src/utils/expertCertificates');
const oss = require('../src/utils/oss');
const { normalizeLanguages } = require('../../shared/expertQualifications.cjs');
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
