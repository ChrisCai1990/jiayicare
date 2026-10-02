const test = require('node:test');
const assert = require('node:assert/strict');
const { effectivePackageName } = require('../src/utils/effectivePackageName');

test('legacy individual health escort name resolves only for Jiayiguanjia non-enterprise members', () => {
  const legacy = { clientBrand: 'jiayiguanjia', servicePackage: '健康护航计划' };
  assert.equal(effectivePackageName(legacy), '个人健康护航计划');
  assert.equal(effectivePackageName({ ...legacy, enterpriseId: 'enterprise' }), '健康护航计划');
  assert.equal(effectivePackageName({ ...legacy, membershipTier: 'enterprise' }), '健康护航计划');
  assert.equal(effectivePackageName({ ...legacy, clientBrand: 'jinyisen' }), '健康护航计划');
  assert.equal(effectivePackageName({ ...legacy, servicePackage: '健康预防计划' }), '健康预防计划');
});
