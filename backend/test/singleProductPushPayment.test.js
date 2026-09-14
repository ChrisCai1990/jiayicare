const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readRoute = name => fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', name), 'utf8');

test('single-product staff pushes persist the canonical products array', () => {
  const source = readRoute('staff.js');
  assert.match(source, /const productItem = \{/);
  assert.match(source, /products: \[productItem\]/);
});

test('push-record payment accepts legacy records that only contain productId', () => {
  const source = readRoute('user.js');
  assert.match(source, /record\.products\?\.length \? record\.products : \(record\.productId/);
  assert.match(source, /new Set\(selectedProductIds\.map\(String\)\)/);
  assert.match(source, /selectedIdSet\.has\(String\(p\.productId\)\)/);
  assert.match(source, /async function resolveOrderWorkflowAssignee\(userId, serviceName = ''\)/);
  assert.match(source, /return resolveHealthPlanner\(userId\)/);
  assert.match(source, /wechatPay\.createJsapiPayment/);
  assert.match(source, /paymentParams: prepay\.client/);
  assert.match(source, /if \(toPay\.length > 1\)/);
  assert.match(source, /已切换为微信真实支付订单/);
});

test('miniprogram pushed-product checkout invokes and verifies WeChat payment', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'miniprogram', 'src', 'pages', 'messages', 'index.jsx'), 'utf8');
  assert.match(source, /requestWechatPayment\(result\.data\.paymentParams\)/);
  assert.match(source, /waitForPayment\(result\.data\.orderId\)/);
});
