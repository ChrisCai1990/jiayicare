const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { tenantContext } = require('../src/utils/tenantScope');
const CompanyInfo = require('../src/models/CompanyInfo');
const Department = require('../src/models/Department');
const StaffRole = require('../src/models/StaffRole');

test('company settings, departments and custom roles stay inside the signed-in institution', async () => {
  const own = new mongoose.Types.ObjectId();
  const foreign = new mongoose.Types.ObjectId();
  await new Promise((resolve, reject) => tenantContext({ admin: { _id: own, role: 'superadmin', tenantId: own } }, {}, async () => {
    try {
      for (const Model of [CompanyInfo, Department, StaffRole]) {
        const query = Model.find({ tenantId: foreign });
        await new Promise((done, fail) => Model.schema.s.hooks.execPre('find', query, [], error => error ? fail(error) : done()));
        assert.equal(String(query.getQuery().tenantId), String(own), Model.modelName);
      }
      resolve();
    } catch (error) { reject(error); }
  }));
  for (const Model of [CompanyInfo, Department, StaffRole]) {
    assert.equal(Model.schema.path('tenantId') != null, true, Model.modelName);
  }
});
