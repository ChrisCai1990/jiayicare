const test = require('node:test');
const assert = require('node:assert/strict');
const Tenant = require('../src/models/Tenant');
const { jiayihuiTenantId } = require('../src/utils/jiayihuiTenant');

test('Jiayihui registration uses a stable active tenant', async () => {
  const original = Tenant.findOneAndUpdate;
  const id = '507f1f77bcf86cd799439011';
  try {
    Tenant.findOneAndUpdate = async (filter, update, options) => {
      assert.deepEqual(filter, { code: 'jiayihui' });
      assert.equal(update.$setOnInsert.name, '嘉医汇');
      assert.equal(options.upsert, true);
      return { _id: id, status: 'active' };
    };
    assert.equal(await jiayihuiTenantId(), id);
    Tenant.findOneAndUpdate = async () => ({ _id: id, status: 'suspended' });
    await assert.rejects(jiayihuiTenantId(), /已停用/);
  } finally { Tenant.findOneAndUpdate = original; }
});
