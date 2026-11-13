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

test('exact entered yuan amounts survive percentage display and refund allocation', () => {
  const amounts = [1480000, 100000, 100000, 200000];
  const roles = ['familyDoctor', 'healthManager', 'medicalAssistant', 'enterpriseResource'];
  const order = { businessAllocationsSnapshot: amounts.map((amount, index) => ({
    key: String(index), name: `归属${index}`, businessType: index === 3 ? 'enterprise' : 'service',
    teamRole: roles[index], allocationAmountCents: amount,
    revenueSharePercent: amount / 1880000 * 100,
  })) };
  assert.deepEqual(allocations(order, 1880000).map(row => row.amountCents), amounts);
  assert.equal(allocations(order, 1780000).reduce((sum, row) => sum + row.amountCents, 0), 1780000);
});
