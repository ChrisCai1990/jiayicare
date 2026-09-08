const test = require('node:test');
const assert = require('node:assert/strict');
const { POINTS_PER_YUAN, conversionFor, pointsBalanceFields } = require('../src/utils/pointsHealthFund');
const { refundBalanceFields } = require('../src/utils/orderPoints');
const fs = require('node:fs');
const path = require('node:path');

test('100 points exchange for one yuan health fund', () => {
  assert.equal(POINTS_PER_YUAN, 100);
  assert.deepEqual(conversionFor(95, 5), { pointsBalance: 0, redeemedPoints: 100, fundAmount: 1 });
});

test('conversion keeps points below the next complete hundred', () => {
  assert.deepEqual(conversionFor(198, 5), { pointsBalance: 3, redeemedPoints: 200, fundAmount: 2 });
  assert.deepEqual(conversionFor(20, 5), { pointsBalance: 25, redeemedPoints: 0, fundAmount: 0 });
});

test('legacy staff-managed points are included once during migration', () => {
  assert.deepEqual(conversionFor(45, 5, 50), { pointsBalance: 0, redeemedPoints: 100, fundAmount: 1 });
});

test('admin-configured exchange rate is used by conversion calculation', () => {
  assert.deepEqual(conversionFor(45, 5, 0, 50), { pointsBalance: 0, redeemedPoints: 50, fundAmount: 1 });
});

test('database conversion clamps legacy negative points before changing fund balance', () => {
  const fields = pointsBalanceFields(0, { enabled: true, pointsPerYuan: 100 });
  const moduloTotal = fields.pointsBalance.$mod[0];
  const fundTotal = fields.healthFundBalance.$add[1].$floor.$divide[0];
  assert.deepEqual(moduloTotal, { $max: [0, { $add: [{ $ifNull: ['$pointsBalance', 0] }, { $ifNull: ['$points', 0] }, 0] }] });
  assert.deepEqual(fundTotal, moduloTotal);
});

test('order-triggered conversions stay linked to the order and refund reverses the converted fund', () => {
  const conversionSource = fs.readFileSync(path.join(__dirname, '../src/utils/pointsHealthFund.js'), 'utf8');
  const refundSource = fs.readFileSync(path.join(__dirname, '../src/utils/orderPoints.js'), 'utf8');
  assert.match(conversionSource, /orderId: refType === 'Order' \? refId : null/);
  assert.match(conversionSource, /refType: refType === 'Order' \? 'Order' : 'HealthFund'/);
  assert.match(refundSource, /refundBalanceFields/);
  assert.match(refundSource, /reversedFund = Math\.min/);
});

test('order refund balance update clamps both fund and points at zero', () => {
  const fields = refundBalanceFields({ awardedPoints: 600, convertedFund: 6, pointsPerYuan: 100 });
  assert.deepEqual(fields.healthFundBalance.$round[0].$max[0], 0);
  assert.deepEqual(fields.pointsBalance.$max[0], 0);
  assert.deepEqual(fields.healthFundBalance.$round[0].$max[1].$subtract[1], 6);
});

test('admin cancellation checks the confirmed payment record before changing order state', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/admin.js'), 'utf8');
  assert.match(source, /Payment\.findOne\(\{ order: currentOrder\._id, status: 'succeeded' \}\)/);
  assert.match(source, /source: 'admin_cancel_guard'/);
});
