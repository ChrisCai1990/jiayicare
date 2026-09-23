const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  const pushes = new Map();
  const updates = [];
  let active = true;
  const mocks = {
    crypto: require('node:crypto'),
    '../models/Order': { updateOne: async (filter, update) => { updates.push({ filter, update }); } },
    '../models/PushRecord': {
      findOne: async query => [...pushes.values()].find(row => row.sourceOrderId === query.sourceOrderId) || null,
      updateOne: async (query, update) => { if (!pushes.has(query._id)) pushes.set(query._id, update.$setOnInsert); },
    },
    '../models/DynamicQuestionnaire': { DynamicQuestionnaire: {
      findOne: () => ({ select: async () => active ? { _id: 'questionnaire', title: '体检问卷' } : null }),
      updateOne: async () => {},
    } },
  };
  const context = { module: { exports: {} }, require: name => mocks[name], console: { error: () => {} }, Date };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/paidCheckupQuestionnaire'), 'utf8'), context);
  const order = { _id: 'order', user: 'patient', supervisorId: 'planner', paymentStatus: 'pending', serviceWorkflowSnapshot: { key: 'checkup', questionnaireId: 'questionnaire' } };
  return { ensure: context.module.exports.ensurePaidCheckupQuestionnaire, pushes, updates, order, setActive: value => { active = value; } };
}

test('checkup questionnaire is not pushed before payment and is idempotent after payment', async () => {
  const h = harness();
  assert.equal(await h.ensure(h.order), false);
  assert.equal(h.pushes.size, 0);
  h.order.paymentStatus = 'paid';
  assert.equal(await h.ensure(h.order), true);
  assert.equal(await h.ensure(h.order), true);
  assert.equal(h.pushes.size, 1);
  assert.equal(h.updates.length, 2);
  assert.equal(h.updates[0].filter.paymentStatus, 'paid');
});

test('temporarily unavailable questionnaire records retry state without blocking payment', async () => {
  const h = harness(); h.order.paymentStatus = 'paid'; h.setActive(false);
  assert.equal(await h.ensure(h.order), false);
  assert.equal(h.pushes.size, 0);
  assert.equal(h.updates[0].update.$set.checkupIntake.status, 'push_failed');
  h.setActive(true);
  assert.equal(await h.ensure(h.order), true);
  assert.equal(h.pushes.size, 1);
});

test('checkout and settlement only invoke questionnaire push after paid status', () => {
  const checkout = fs.readFileSync(require.resolve('../src/routes/services'), 'utf8');
  const settlement = fs.readFileSync(require.resolve('../src/utils/orderSettlement'), 'utf8');
  assert.ok(checkout.indexOf("if (paidAmount === 0)") < checkout.indexOf("ensurePaidCheckupQuestionnaire(order)"));
  assert.ok(settlement.indexOf("order.paymentStatus = 'paid'") < settlement.indexOf("ensurePaidCheckupQuestionnaire(order)"));
});
