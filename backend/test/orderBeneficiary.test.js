const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveOrderBeneficiary } = require('../src/utils/orderBeneficiary');

const payerId = '507f1f77bcf86cd799439011';
const recipientId = '507f1f77bcf86cd799439012';
const payer = { _id: payerId, tenantId: 't1', familyLinks: [{ linkedUser: recipientId }] };
const adult = { _id: recipientId, tenantId: 't1', patientCategory: 'adult', familyLinks: [{ linkedUser: payerId }] };
const model = user => ({ User: { findOne: async () => user } });

test('payer may purchase for self and a mutually linked adult', async () => {
  assert.equal(await resolveOrderBeneficiary(payer, payerId), payer);
  assert.equal(await resolveOrderBeneficiary(payer, recipientId, model(adult)), adult);
});

test('unlinked or cross-tenant adults cannot be selected', async () => {
  assert.equal(await resolveOrderBeneficiary(payer, recipientId, model({ ...adult, familyLinks: [] })), null);
  assert.equal(await resolveOrderBeneficiary(payer, recipientId, model({ ...adult, tenantId: 't2' })), null);
  assert.equal(await resolveOrderBeneficiary(payer, 'invalid', model(adult)), null);
});

test('child requires an active guardian relationship', async () => {
  const child = { ...adult, patientCategory: 'child', familyLinks: [] };
  assert.equal(await resolveOrderBeneficiary(payer, recipientId, { ...model(child), guardianChild: async () => ({ child }) }), child);
  assert.equal(await resolveOrderBeneficiary(payer, recipientId, { ...model(child), guardianChild: async () => null }), null);
});
