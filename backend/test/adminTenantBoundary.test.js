const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { platformAdminMayAccess } = require('../src/utils/adminAccess');
const { tenantContext, tenantScopePlugin } = require('../src/utils/tenantScope');

test('platform admin API allowlist excludes institution business routes', () => {
  for (const path of ['/api/admin/tenants', '/api/admin/tenants/123', '/api/admin/ai-control', '/api/admin/me/password']) {
    assert.equal(platformAdminMayAccess(path), true, path);
  }
  for (const path of ['/api/admin/patients', '/api/admin/dashboard', '/api/admin/tenants-other', '/api/metabolic-pilot', '/api/admin/ai-control-other']) {
    assert.equal(platformAdminMayAccess(path), false, path);
  }
});

test('tenant query hook overrides a foreign tenantId supplied by a caller', async () => {
  const schema = new mongoose.Schema({ tenantId: mongoose.Schema.Types.ObjectId, name: String });
  schema.plugin(tenantScopePlugin);
  const Model = mongoose.model('AdminTenantBoundaryTest', schema);
  const own = new mongoose.Types.ObjectId();
  const foreign = new mongoose.Types.ObjectId();

  await new Promise((resolve, reject) => tenantContext({ admin: { _id: own, role: 'superadmin', tenantId: own } }, {}, async () => {
    try {
      for (const operation of ['find', 'findOne', 'findOneAndUpdate', 'countDocuments', 'updateOne', 'updateMany', 'deleteMany']) {
        const query = operation === 'findOneAndUpdate' || operation === 'updateOne' || operation === 'updateMany'
          ? Model[operation]({ tenantId: foreign }, { $set: { name: 'changed' } })
          : Model[operation]({ tenantId: foreign });
        await new Promise((done, fail) => schema.s.hooks.execPre(operation, query, [], error => error ? fail(error) : done()));
        assert.equal(String(query.getQuery().tenantId), String(own), operation);
      }
      const aggregate = Model.aggregate([{ $match: { tenantId: foreign } }, { $group: { _id: '$tenantId' } }]);
      await new Promise((done, fail) => schema.s.hooks.execPre('aggregate', aggregate, [], error => error ? fail(error) : done()));
      assert.equal(String(aggregate.pipeline()[0].$match.tenantId), String(own));
      resolve();
    } catch (error) { reject(error); }
  }));
});

test('tenant writes cannot move or insert records into another institution', async () => {
  const schema = new mongoose.Schema({ tenantId: mongoose.Schema.Types.ObjectId, name: String });
  schema.plugin(tenantScopePlugin);
  const Model = mongoose.model('AdminTenantWriteBoundaryTest', schema);
  const own = new mongoose.Types.ObjectId();
  const foreign = new mongoose.Types.ObjectId();

  await new Promise((resolve, reject) => tenantContext({ admin: { _id: own, role: 'superadmin', tenantId: own } }, {}, async () => {
    try {
      const moving = Model.updateOne({ name: 'sample' }, { $set: { tenantId: foreign } });
      await assert.rejects(
        new Promise((done, fail) => schema.s.hooks.execPre('updateOne', moving, [], error => error ? fail(error) : done())),
        /机构归属不可通过业务请求修改/
      );
      const ownUpsert = Model.updateOne({ name: 'new' }, { $setOnInsert: { tenantId: own } }, { upsert: true });
      await new Promise((done, fail) => schema.s.hooks.execPre('updateOne', ownUpsert, [], error => error ? fail(error) : done()));
      const foreignUpsert = Model.updateOne({ name: 'new' }, { $setOnInsert: { tenantId: foreign } }, { upsert: true });
      await assert.rejects(
        new Promise((done, fail) => schema.s.hooks.execPre('updateOne', foreignUpsert, [], error => error ? fail(error) : done())),
        /机构归属不可通过业务请求修改/
      );
      const replacement = Model.replaceOne({ name: 'old' }, { name: 'new' });
      await assert.rejects(
        new Promise((done, fail) => schema.s.hooks.execPre('replaceOne', replacement, [], error => error ? fail(error) : done())),
        /不能整体替换记录/
      );

      const docs = [{ name: 'new' }];
      await new Promise((done, fail) => schema.s.hooks.execPre('insertMany', Model, [docs], error => error ? fail(error) : done()));
      assert.equal(String(docs[0].tenantId), String(own));

      const foreignDocs = [{ tenantId: foreign, name: 'foreign' }];
      await assert.rejects(
        new Promise((done, fail) => schema.s.hooks.execPre('insertMany', Model, [foreignDocs], error => error ? fail(error) : done())),
        /不能写入其他机构的数据/
      );
      resolve();
    } catch (error) { reject(error); }
  }));
});
