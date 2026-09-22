const test = require('node:test');
const assert = require('node:assert/strict');

test('annual plan returns to actual router entry, with safe direct-link fallback', async () => {
  const { annualPlanReturnTarget } = await import('../../staff/src/utils/annualPlanNavigation.mjs');
  for (const index of [1, 8]) assert.equal(annualPlanReturnTarget(index, '/plans'), -1);
  for (const index of [undefined, null, 0, -1, '1', NaN]) {
    assert.equal(annualPlanReturnTarget(index, '/plans?tab=annual_health_mgmt'), '/plans?tab=annual_health_mgmt');
  }
});
