const test = require('node:test');
const assert = require('node:assert/strict');
const { PRICE, productTerms, validatePublishedProduct, periodFromPayment, ensurePeriod } = require('../src/utils/ibdServiceTerms');

test('IBD term begins at Shanghai midnight seven calendar days after payment', () => {
  const terms = productTerms();
  const { start, end } = periodFromPayment('2026-10-09T23:30:00+08:00', terms);
  assert.equal(start.toISOString(), '2026-10-15T16:00:00.000Z');
  assert.equal(end.toISOString(), '2027-10-15T16:00:00.000Z');
});

test('payment settlement preserves the original annual period on retry', () => {
  const order = { specialtyTermsSnapshot: productTerms(), paidAt: new Date('2026-10-09T10:00:00+08:00') };
  assert.equal(ensurePeriod(order), true);
  const first = order.specialtyService.startsAt.toISOString();
  order.paidAt = new Date('2026-10-10T10:00:00+08:00');
  assert.equal(ensurePeriod(order), false);
  assert.equal(order.specialtyService.startsAt.toISOString(), first);
  assert.equal(order.specialtyService.includedEscorts, 2);
});

test('IBD listing requires approved price, duration, two escorts and both regions', () => {
  const product = { name: 'IBD 年度专病管理服务', category: '专病管理', originalPrice: PRICE,
    servicePrices: [], skus: [], specialtyTerms: productTerms() };
  assert.equal(validatePublishedProduct(product), null);
  assert.match(validatePublishedProduct({ ...product, originalPrice: 0 }), /2980/);
  assert.match(validatePublishedProduct({ ...product, specialtyTerms: { ...productTerms(), includedEscorts: 3 } }), /2 次陪诊/);
});
