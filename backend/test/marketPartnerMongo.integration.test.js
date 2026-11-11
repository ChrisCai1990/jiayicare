const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { auditMarketPartnerIndexes } = require('../src/utils/marketPartnerIndexes');
const Receipt = require('../src/models/MarketPartnerReceipt');
const Commission = require('../src/models/MarketPartnerCommission');
const Order = require('../src/models/Order');
const Refund = require('../src/models/Refund');
const TeamIncentive = require('../src/models/TeamIncentive');

async function assertOneOfTwenty(model, makeDocument, query) {
  const writes = await Promise.allSettled(Array.from({ length: 20 }, () =>
    model.collection.insertOne(makeDocument())));
  assert.equal(writes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(writes.filter(result => result.status === 'rejected' && result.reason.code === 11000).length, 19);
  assert.equal(await model.collection.countDocuments(query), 1);
}

test('local MongoDB enforces partner indexes and concurrent payment idempotency', {
  skip: process.env.RUN_MARKET_PARTNER_LOCAL_MONGO_TEST !== 'true',
}, async () => {
  const database = `jiayicare_partner_test_${crypto.randomUUID().replaceAll('-', '')}`;
  // An explicit loopback target keeps this test away from application and production databases.
  const uri = `mongodb://127.0.0.1:27135/${database}`;
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    const missingBefore = await auditMarketPartnerIndexes();
    assert.ok(missingBefore.length > 0);
    await auditMarketPartnerIndexes({ apply: true });
    assert.deepEqual(await auditMarketPartnerIndexes(), []);

    const tenantId = new mongoose.Types.ObjectId();
    const receiptReference = 'offline-payment-001';
    await assertOneOfTwenty(Receipt,
      () => ({ tenantId, orderId: new mongoose.Types.ObjectId(), reference: receiptReference }),
      { tenantId, reference: receiptReference });

    const paymentReference = 'partner-transfer-001';
    await assertOneOfTwenty(Commission,
      () => ({ tenantId, orderId: new mongoose.Types.ObjectId(), partnerId: new mongoose.Types.ObjectId(),
        paymentReferences: [paymentReference] }),
      { tenantId, paymentReferences: paymentReference });
    await assertOneOfTwenty(Commission,
      () => ({ tenantId, orderId: new mongoose.Types.ObjectId(), partnerId: new mongoose.Types.ObjectId(),
        recoveryReferences: ['partner-recovery-001'] }),
      { tenantId, recoveryReferences: 'partner-recovery-001' });
    await assertOneOfTwenty(Order,
      () => ({ tenantId, marketPartnerContractReference: 'contract-001' }),
      { tenantId, marketPartnerContractReference: 'contract-001' });
    await assertOneOfTwenty(Refund,
      () => ({ marketPartnerOfflineReference: 'offline-refund-001' }),
      { marketPartnerOfflineReference: 'offline-refund-001' });
    await assertOneOfTwenty(TeamIncentive,
      () => ({ tenantId, orderId: new mongoose.Types.ObjectId(), staffId: new mongoose.Types.ObjectId(),
        paymentReference: 'team-transfer-001' }),
      { tenantId, paymentReference: 'team-transfer-001' });
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
