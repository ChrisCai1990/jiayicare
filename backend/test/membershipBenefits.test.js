const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture({ rows = [], exists = false, active = true, pkg = null } = {}) {
  const mocks = {
    '../models/PackageEntitlement': { exists: async () => exists },
    '../models/ServicePackage': { findOne: () => ({ lean: async () => pkg }) },
    './serviceAccess': { legacyAccess: () => ({ active }) },
    './packageEntitlements': { applicableEntitlements: async () => rows },
    './packageEntitlementSnapshot': { buildPackageEntitlementSnapshot: async p => p.rights },
  };
  function load(name) {
    const ctx = { module: { exports: {} }, require: key => {
      if (!(key in mocks)) throw new Error(`Unexpected dependency: ${key}`);
      return mocks[key];
    }};
    vm.runInNewContext(fs.readFileSync(require.resolve(`../src/utils/${name}`), 'utf8'), ctx);
    return ctx.module.exports;
  }
  const benefits = load('membershipBenefits');
  mocks['./membershipBenefits'] = benefits;
  return { ...benefits, ...load('packageFeatureEntitlements') };
}
const user = { _id: 'customer', membershipTier: 'basic', servicePackage: 'Configured plan', serviceStartDate: '2026-06-01', serviceExpiry: '2027-05-31' };
const pkg = { name: 'Configured plan', configuration: { membershipTier: 'annual', includes365: true }, rights: { aiEntitlements: { healthConsultation: true }, productEntitlements: [{ productName: 'Review', count: 5, remainingCount: 5 }] } };
test('valid configured annual plan qualifies legacy basic account without changing its tier', async () => {
  const api = fixture({ pkg });
  assert.equal(await api.hasHealthFundAccess(user), true);
  const result = await api.membershipBenefits(user);
  assert.equal(result.plans[0].name, pkg.name);
  assert.equal(result.plans[0].validUntil, user.serviceExpiry);
  assert.match(result.plans[0].items[1].value, /已用及剩余待核对/);
  assert.equal(user.membershipTier, 'basic');
});
test('expired period, unknown plan and cancelled/expired ledger cannot revive access', async () => {
  for (const options of [{pkg,active:false},{pkg:null},{pkg,exists:true}]) {
    const api = fixture(options);
    assert.equal(await api.hasHealthFundAccess(user), false);
    assert.equal((await api.membershipBenefits(user)).plans.length, 0);
  }
});
test('frozen ledger wins over edited plan, reports pool totals and only own usage', async () => {
  const rows = [{ _id: 'ledger', packageName: 'Sold plan', rights: {
    membershipTier: 'annual', sharedEntitlementPools: [{key:'pool',name:'Consultation',count:5,remainingCount:3}],
    productEntitlements: [{productName:'Review',poolKey:'pool',count:0,remainingCount:0}],
  }, usageRecords: [{usedByUserId:'customer',productName:'Review',usedAt:'2026-09-20',note:'private'}, {usedByUserId:'relative',productName:'Other'}] }];
  const api = fixture({rows,pkg});
  const plan = (await api.membershipBenefits(user)).plans[0];
  assert.equal(plan.name, 'Sold plan');
  assert.match(plan.items[0].value, /已用 2 次 · 剩余 3 次/);
  assert.match(plan.items[1].value, /共享次数，不单独累计/);
  assert.equal(plan.usage.length,1);
  assert.equal(plan.usage[0].note,undefined);
  assert.equal(await api.hasHealthFundAccess(user),true);
});
test('active ledger without qualifying tier cannot be overridden by legacy annual plan',async()=>{
  assert.equal(await fixture({pkg,rows:[{rights:{membershipTier:'basic'}}]}).hasHealthFundAccess(user),false);
});
test('missing remaining quota is unknown, never presumed unused',()=>{
  const plan=fixture().project({rights:{productEntitlements:[{productName:'Review',count:5}]}},user._id);
  assert.match(plan.items[0].value,/待核对/);
});
