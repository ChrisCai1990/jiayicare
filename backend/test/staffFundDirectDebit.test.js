const test = require('node:test');
const assert = require('node:assert/strict');
const HealthFundTransaction = require('../src/models/HealthFundTransaction');
const { deductHealthFund } = require('../src/utils/healthFundPayment');

test('staff direct fund debit resumes after ledger write failure without charging twice', async () => {
  const original = { find: HealthFundTransaction.find, insertMany: HealthFundTransaction.insertMany };
  const ledger = [];
  let failInsert = true;
  const account = { _id: '507f1f77bcf86cd799439011', healthFundBalance: 100,
    healthFundDirectDebitOrderIds: [] };
  const user = { _id: account._id, constructor: {
    findOneAndUpdate: async (query) => {
      if (account.healthFundBalance < 80 || account.healthFundDirectDebitOrderIds.some(id => String(id) === String(query.healthFundDirectDebitOrderIds.$ne))) return null;
      account.healthFundBalance = 20;
      account.healthFundDirectDebitOrderIds.push(query.healthFundDirectDebitOrderIds.$ne);
      return account;
    },
    findById: async () => account,
  } };
  HealthFundTransaction.find = async () => ledger;
  HealthFundTransaction.insertMany = async rows => {
    if (failInsert) { failInsert = false; throw new Error('interrupted ledger write'); }
    ledger.push(...rows);
    return rows;
  };
  const order = { _id: '507f1f77bcf86cd799439012', orderNo: 'HF507f1f77bcf86cd799439012',
    initiationSource: 'staff_direct', serviceName: '就医陪同服务' };
  try {
    await assert.rejects(deductHealthFund({ user, order, amount: 80,
      breakdown: { personal: 50, corporate: 30 } }), /interrupted ledger write/);
    assert.equal(account.healthFundBalance, 20);
    await deductHealthFund({ user, order, amount: 80, breakdown: { personal: 50, corporate: 30 } });
    assert.equal(account.healthFundBalance, 20);
    assert.deepEqual(ledger.map(row => row.amount), [-50, -30]);
    await deductHealthFund({ user, order, amount: 80, breakdown: { personal: 50, corporate: 30 } });
    assert.equal(account.healthFundBalance, 20);
    assert.equal(ledger.length, 2);
  } finally {
    HealthFundTransaction.find = original.find;
    HealthFundTransaction.insertMany = original.insertMany;
  }
});
