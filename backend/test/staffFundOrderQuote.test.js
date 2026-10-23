const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const start = source.indexOf('async function staffFundOrderQuote(req) {');
const end = source.indexOf("router.post('/patients/:id/fund-orders/quote'", start);

function harness({ name = '就医陪同服务', rights = [], personal = 100 } = {}) {
  const patient = { _id: 'patient', tenantId: 'tenant' };
  const product = { _id: 'product', status: 'on', name, category: '就医服务',
    fulfillmentType: 'offline_service', memberBundle: { enabled: false },
    servicePrices: [{ label: '单次', price: 100 }] };
  const context = {
    module: { exports: {} },
    mongoose: { isValidObjectId: () => true },
    allPushPatientsBelongToStaff: async () => true,
    getVisiblePlanPatientIds: async () => ['patient'],
    User: { findById: async () => patient },
    Product: { findOne: async () => product },
    require: name => name === '../utils/packageEntitlements'
      ? { applicableEntitlements: async () => rights }
      : { validateHealthFundDeduction: async () => ({ allowed: personal, breakdown: { personal, corporate: 0 } }) },
  };
  vm.runInNewContext(`${source.slice(start, end)}\nmodule.exports = staffFundOrderQuote;`, context);
  return context.module.exports({ params: { id: 'patient' }, staff: { _id: 'advisor' },
    body: { productId: 'product', specificationLabel: '单次' } });
}

test('staff quote uses the current catalog price and own-fund amount', async () => {
  const quote = await harness();
  assert.equal(quote.price, 100);
  assert.equal(quote.shortage, 0);
});

test('annual expert service and usable package service are not charged again', async () => {
  await assert.rejects(harness({ name: '专家约诊服务', rights: [{ rights: {
    aiEntitlements: { expertAppointment: true } } }] }), /不限次专家约诊/);
  await assert.rejects(harness({ rights: [{ rights: { productEntitlements: [{
    productId: 'product', specificationLabel: '单次', remainingCount: 1,
  }] } }] }), /套餐服务权益/);
});
