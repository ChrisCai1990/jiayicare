const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture({rows = [], exists = false, active = true, pkg = null} = {}) {
  const mocks = {
    '../models/PackageEntitlement': {exists: async () => exists},
    '../models/ServicePackage': {findOne: () => ({lean: async () => pkg})},
    './serviceAccess': {legacyAccess: () => ({active})},
    './packageEntitlements': {applicableEntitlements: async () => rows},
    './effectivePackageName': require('../src/utils/effectivePackageName'),
    './packageEntitlementSnapshot': {buildPackageEntitlementSnapshot: async p => p.rights},
  };
  const context = {module: {exports: {}}, require: key => {assert.ok(key in mocks); return mocks[key];}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/membershipBenefits'), 'utf8'), context);
  return context.module.exports;
}
const user = {_id: 'self', servicePackage: 'Plan'};
test('legacy configuration does not invent remaining quota', async () => {
  const api = fixture({pkg: {name: 'Plan', rights: {productEntitlements: [{productName: 'Review', count: 12, remainingCount: 12}]}}});
  const result = await api.membershipBenefits(user);
  assert.equal(result.plans[0].groups.independent[0].usageKnown, false);
  assert.equal(result.plans[0].groups.independent[0].remaining, null);
});
test('cancelled ledger never falls back to editable profile', async () => {
  const api = fixture({exists: true, pkg: {name: 'Plan', rights: {}}});
  assert.equal((await api.membershipBenefits(user)).plans.length, 0);
});
test('expired legacy membership has no active rights', async () => {
  assert.equal((await fixture({active: false}).membershipBenefits(user)).plans.length, 0);
});
test('ledger preserves shared quota, frequencies and customer usage isolation', async () => {
  const row = {_id: 'ledger', packageName: 'Corporate', rights: {
    aiEntitlements: {aiHealthAnalysis: true, healthConsultation: true},
    sharedEntitlementPools: [{key: 'pool', name: 'Shared', count: 4, remainingCount: 2}],
    productEntitlements: [{poolKey: 'pool', productName: 'Escort', count: 4}],
  }, usageRecords: [{usedByUserId: 'other', productName: 'Private'}, {usedByUserId: 'self', productName: 'Escort'}]};
  const before = JSON.stringify(row);
  const plan = (await fixture({rows: [row]}).membershipBenefits(user)).plans[0];
  assert.equal(plan.groups.shared[0].remaining, 2);
  assert.equal(plan.groups.independent.length, 0);
  assert.equal(plan.groups.serviceStages[0].services[0].frequency, '每个会员服务期 1 次');
  assert.equal(plan.groups.serviceStages[1].services[0].frequency, '服务期内不限次');
  assert.equal(plan.usage.length, 1);
  assert.equal(plan.usage[0].name, 'Escort');
  assert.equal(JSON.stringify(row), before);
});
test('historic effective package shows new automatic usage without claiming a verified balance', async () => {
  const row = { _id: 'effective', sourceType: 'effective_service', historyVerified: false,
    packageName: 'Young', rights: { productEntitlements: [{ productId: 'nutrition', productName: '营养评估服务', count: 12, remainingCount: 11 }] },
    usageRecords: [{ usedByUserId: 'self', productId: 'nutrition', productName: '营养评估服务', status: 'redeemed', usedAt: '2026-10-02' }] };
  const plan = (await fixture({ rows: [row] }).membershipBenefits(user)).plans[0];
  assert.equal(plan.groups.independent[0].usageKnown, false);
  assert.equal(plan.usage.length, 1);
  assert.match(plan.notice, /历史使用仍待核对/);
  assert.match(plan.items[0].value, /新增已核销 1 次/);
  assert.doesNotMatch(plan.items[0].value, /剩余 11|可用 11/);
});
