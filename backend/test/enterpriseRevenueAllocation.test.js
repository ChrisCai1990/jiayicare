const test = require('node:test');
const assert = require('node:assert/strict');
const { allocations } = require('../src/utils/businessRevenueAllocation');

test('enterprise resource and service team split only net cash once', () => {
  const order = { businessAllocationsSnapshot: [
    { key: 'service', name: '健康顾问管理服务', businessType: 'service', teamRole: 'familyDoctor', revenueSharePercent: 60 },
    { key: 'resource', name: '企业资源', businessType: 'enterprise', teamRole: 'enterpriseResource', revenueSharePercent: 40 },
  ] };
  const rows = allocations(order, 9000);
  assert.deepEqual(rows.map(row => row.amountCents), [5400, 3600]);
  assert.equal(rows.reduce((sum, row) => sum + row.amountCents, 0), 9000);
  assert.equal(rows[1].businessType, 'enterprise');
});
