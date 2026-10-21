const test = require('node:test');
const assert = require('node:assert/strict');
const { isAnnualCustomer } = require('../src/utils/researchAnnualCustomer');

const noPlan = { exists: async () => null };
const noPackage = { findOne: () => ({ select: () => ({ lean: async () => null }) }) };

test('configured annual service versions qualify before an annual plan is created', async () => {
  for (const [name, clientBrand] of [
    ['健康预防计划', 'jiayiguanjia'],
    ['健康护航计划', 'jiayiguanjia'],
    ['健康重塑计划', ''],
  ]) {
    assert.equal(await isAnnualCustomer(
      { _id: 'member', membershipTier: 'basic', servicePackage: name, clientBrand },
      { AnnualPlan: noPlan, ServicePackage: noPackage },
    ), true, name);
  }
});

test('an unrelated package is not treated as annual from its display name', async () => {
  assert.equal(await isAnnualCustomer(
    { _id: 'member', membershipTier: 'basic', servicePackage: '365健康会员', clientBrand: 'jiayiguanjia' },
    { AnnualPlan: noPlan, ServicePackage: noPackage },
  ), false);
});

test('an annual package configuration qualifies a legacy package name', async () => {
  let searchedName = '';
  const packages = { findOne: filter => {
    searchedName = filter.name;
    return { select: () => ({ lean: async () => ({ configuration: { membershipTier: 'annual' } }) }) };
  } };
  assert.equal(await isAnnualCustomer(
    { _id: 'member', membershipTier: 'basic', servicePackage: '个人健康护航计划', clientBrand: 'jiayiguanjia' },
    { AnnualPlan: noPlan, ServicePackage: packages },
  ), true);
  assert.equal(searchedName, '个人健康护航计划');
});
