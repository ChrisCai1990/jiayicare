const test = require('node:test');
const assert = require('node:assert/strict');
const { deleteOssFileVerified } = require('../src/utils/accountDeletionFiles');
function setup() {
  let deletes = 0;
  const input = {
    subject: { userId: 'u1', tenantId: 't1' },
    file: { storage: 'oss', ownerId: 'u1', tenantId: 't1', exclusive: true, disposition: 'erase', key: 'reports/synthetic.pdf' },
    assertFrozen: async () => true, assertExclusive: async () => true,
    client: { options: { bucket: 'synthetic-test-bucket' },
      getBucketVersioning: async () => ({ status: 200, versionStatus: undefined }),
      delete: async () => { deletes++; },
      head: async () => { throw Object.assign(new Error('missing'), { code: 'NoSuchKey', status: 404 }); },
    },
  };
  return { input, deletes: () => deletes };
}
test('verified exclusive object is deleted and absence confirmed', async () => {
  const app = setup(); assert.equal((await deleteOssFileVerified(app.input)).erased, true); assert.equal(app.deletes(), 1);
});
test('wrong owner, tenant, shared and retained objects are never deleted', async () => {
  for (const change of [{ ownerId: 'other' }, { tenantId: 'other' }, { exclusive: false }, { disposition: 'retain' }]) {
    const app = setup(); Object.assign(app.input.file, change);
    await assert.rejects(deleteOssFileVerified(app.input)); assert.equal(app.deletes(), 0);
  }
});
test('invalid object paths cannot escape the reviewed manifest', async () => {
  for (const key of ['/reports/a', '../a', 'reports/../a', 'reports/%2e%2e/a', 'reports/a?versionId=x', 'reports//a']) {
    const app = setup(); app.input.file.key = key;
    await assert.rejects(deleteOssFileVerified(app.input)); assert.equal(app.deletes(), 0);
  }
});
test('write lock and exclusive ownership must be verified before deletion', async () => {
  for (const name of ['assertFrozen', 'assertExclusive']) {
    const app = setup(); app.input[name] = async () => false;
    await assert.rejects(deleteOssFileVerified(app.input)); assert.equal(app.deletes(), 0);
  }
});
test('versioned or unknown bucket cannot produce a misleading success', async () => {
  for (const config of [{ status: 200, versionStatus: 'Enabled' }, { status: 200, versionStatus: 'Suspended' }, { status: 403 }, { status: 200 }]) {
    const app = setup(); app.input.client.getBucketVersioning = async () => config;
    await assert.rejects(deleteOssFileVerified(app.input)); assert.equal(app.deletes(), 0);
  }
});
test('storage deletion errors propagate', async () => {
  const app = setup(); app.input.client.delete = async () => { throw new Error('AccessDenied'); };
  await assert.rejects(deleteOssFileVerified(app.input), /AccessDenied/);
});
test('still present, network failure and missing bucket do not count as erased', async () => {
  for (const head of [async () => ({}), async () => { throw new Error('timeout'); }, async () => { throw Object.assign(new Error('bucket'), { status: 404, code: 'NoSuchBucket' }); }]) {
    const app = setup(); app.input.client.head = head;
    await assert.rejects(deleteOssFileVerified(app.input));
  }
});
test('ownership change at final verification prevents completion', async () => {
  const app = setup(); let checks = 0; app.input.assertExclusive = async () => ++checks === 1;
  await assert.rejects(deleteOssFileVerified(app.input));
});
