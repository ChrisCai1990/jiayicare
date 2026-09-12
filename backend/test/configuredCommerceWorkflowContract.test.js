const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('every configured commerce product captures the Admin workflow at order time', () => {
  const services = read('src/routes/services.js');
  const order = read('src/models/Order.js');
  assert.match(order, /serviceWorkflowSnapshot/);
  assert.match(services, /serviceWorkflowSnapshot: product\?\.serviceWorkflow/);
  assert.doesNotMatch(services, /serviceWorkflowSnapshot: product\?\.serviceWorkflow[\s\S]{0,120}key === 'checkup'/);
});

test('clinical execution reads the immutable order snapshot before template defaults', () => {
  const staff = read('src/routes/staff.js');
  assert.match(staff, /Prefer the immutable workflow snapshot captured when the customer ordered/);
  assert.match(staff, /order\?\.serviceWorkflowSnapshot\?\.modules/);
  assert.match(staff, /const configuredSource = productModuleMap\.size/);
});

test('checkup plan design waits for the order-scoped customer health file', () => {
  const staff = read('src/routes/staff.js');
  assert.match(staff, /serviceWorkflowSnapshot\?\.key === 'checkup'/);
  assert.match(staff, /order\.checkupIntake\?\.status !== 'submitted'/);
  assert.match(staff, /请等待用户完成本次体检健康文件后再制定方案/);
});

test('payment creates one staff-owned order work item while patients only receive customer actions', () => {
  const services = read('src/routes/services.js');
  const settlement = read('src/utils/orderSettlement.js');
  const messages = read('src/routes/messages.js');
  assert.match(services, /sourceType: 'order'/);
  assert.match(settlement, /sourceType: 'order', sourceOrderId: order\._id/);
  assert.match(messages, /questionnairePushes/);
  assert.doesNotMatch(messages, /workflowKey|followUpSchemeId|taskRole/);
});

test('other products reuse the same Admin workflow composition fields', () => {
  const product = read('src/models/Product.js');
  const adminPage = read('../admin/src/pages/settings/SupplyWorkflowConfigPage.jsx');
  for (const key of ['nutrition_intervention', 'medical_assist', 'rehab', 'tcm', 'psychology', 'generic_followup', 'fulfillment_only']) {
    assert.match(product, new RegExp(`'${key}'`));
    assert.match(adminPage, new RegExp(`'${key}'`));
  }
  for (const field of ['modules', 'mode', 'trigger', 'sequence']) {
    assert.match(product, new RegExp(field));
    assert.match(adminPage, new RegExp(field));
  }
});
