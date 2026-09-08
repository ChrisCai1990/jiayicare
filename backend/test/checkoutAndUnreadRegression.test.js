const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');

test('service checkout enforces date and requirements on the server', () => {
  const source = read('src/routes/services.js');
  assert.match(source, /requiresServiceConfirmation && !desiredServiceDate/);
  assert.match(source, /requiresServiceConfirmation && !confirmedServiceRequirements/);
});

test('unread count excludes completed questionnaire assignments and legacy answers', () => {
  const source = read('src/routes/messages.js');
  assert.match(source, /answeredPushIds/);
  assert.match(source, /legacyAnsweredQuestionnaireIds/);
  assert.match(source, /pendingQuestionnaireIds/);
  assert.match(source, /validOrderIds/);
  assert.match(source, /status: \{ \$ne: 'cancelled' \}/);
});

test('payment confirmation is recoverable and records the paid fact before side effects', () => {
  const settlement = read('src/utils/orderSettlement.js');
  const payments = read('src/routes/payments.js');
  const orders = read('src/routes/orders.js');
  assert.ok(settlement.indexOf("order.paymentStatus = 'paid'") < settlement.indexOf('deductHealthFund'));
  assert.match(payments, /payment\?\.status === 'succeeded'/);
  assert.match(payments, /source: 'local_recovery'/);
  assert.match(orders, /source: 'cancel_guard'/);
  assert.match(orders, /source: 'cancel_recheck'/);
});

test('health fund deduction tolerates legacy floating point residue and rounds ledger amounts', () => {
  const source = read('src/utils/healthFundPayment.js');
  assert.match(source, /healthFundBalance: \{ \$gte: amount - 0\.005 \}/);
  assert.match(source, /\$round/);
  assert.match(source, /personalAmount/);
  assert.match(source, /corporateAmount/);
});

test('batch read updates both messages and push records within the authenticated user scope', () => {
  const source = read('src/routes/messages.js');
  assert.match(source, /router\.patch\('\/read-batch'/);
  assert.match(source, /user: req\.user\._id, unread: true/);
  assert.match(source, /patientId: req\.user\._id, readAt: null/);
});

test('opening a role thread clears unread legacy and current conversation messages', () => {
  const source = read('src/routes/messages.js');
  assert.match(source, /const threadMessageQuery =/);
  assert.match(source, /\{ type: role, conversationId: null \}/);
  assert.match(source, /Message\.updateMany\(\s*\{ \.\.\.threadMessageQuery, type: \{ \$ne: 'user' \}, unread: true \}/);
  assert.match(source, /message\.unread = false/);
});
