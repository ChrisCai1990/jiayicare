const test = require('node:test');
const assert = require('node:assert/strict');
const { canClaimFamilyPayment } = require('../src/utils/familyProxyPayment');

const member = '507f1f77bcf86cd799439012';
const payer = '507f1f77bcf86cd799439011';
const ready = { user: member, payerUser: null, status: 'pending', tradeStatus: 'awaiting_payment',
  paymentStatus: 'pending', paymentExpectedAmount: 88 };

test('only an unpaid unclaimed order may transfer to a linked family payer', () => {
  assert.equal(canClaimFamilyPayment(ready, member, payer), '');
  assert.match(canClaimFamilyPayment({ ...ready, payerUser: '507f1f77bcf86cd799439013' }, member, payer), /其他付款人/);
  assert.match(canClaimFamilyPayment({ ...ready, paymentStatus: 'paid' }, member, payer), /已付款/);
  assert.match(canClaimFamilyPayment({ ...ready, checkoutGroupId: 'group' }, member, payer), /合并订单/);
  assert.match(canClaimFamilyPayment({ ...ready, couponDiscount: 5 }, member, payer), /重新核价/);
  assert.match(canClaimFamilyPayment({ ...ready, healthFundAmount: 5 }, member, payer), /重新核价/);
  assert.match(canClaimFamilyPayment({ ...ready, paymentExpectedAmount: 0 }, member, payer), /没有待支付金额/);
});
