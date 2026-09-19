const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readRoute = name => fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', name), 'utf8');

test('single-product staff pushes persist the canonical products array', () => {
  const source = readRoute('staff.js');
  const singleRoute = source.slice(source.indexOf("router.post('/products/:id/push'"));
  assert.match(singleRoute, /const productItem = \{/);
  assert.match(singleRoute, /products: \[productItem\]/);
});

test('push-record payment accepts legacy records that only contain productId', () => {
  const source = readRoute('user.js');
  assert.match(source, /record\.products\?\.length \? record\.products : \(record\.productId/);
  assert.match(source, /new Set\(selectedProductIds\.map\(String\)\)/);
  assert.match(source, /selectedIdSet\.has\(String\(p\.productId\)\)/);
  assert.match(source, /resolveOrderWorkflowAssignee, orderOwnershipFields.*require\('\.\.\/utils\/serviceOwnership'\)/);
  const ownership = fs.readFileSync(path.join(__dirname, '../src/utils/serviceOwnership.js'), 'utf8');
  assert.match(ownership, /resolveOrderWorkflowAssignee: resolveServiceSupervisor/);
  assert.match(ownership, /return resolveHealthPlanner\(patientOrId\)/);
  assert.match(source, /wechatPay\.createJsapiPayment/);
  assert.match(source, /paymentParams: prepay\.client/);
  assert.match(source, /if \(toPay\.length > 1\)/);
  assert.match(source, /已切换为微信真实支付订单/);
  assert.match(source, /paymentCapability !== 'wechat_jsapi_v1'/);
  assert.match(source, /PUSH_PAYMENT_UPGRADE_REQUIRED/);
});

test('miniprogram pushed-product checkout invokes and verifies WeChat payment', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'miniprogram', 'src', 'pages', 'messages', 'index.jsx'), 'utf8');
  assert.match(source, /requestWechatPayment\(result\.data\.paymentParams\)/);
  assert.match(source, /waitForPayment\(result\.data\.orderId\)/);
  assert.match(source, /paymentCapability: 'wechat_jsapi_v1'/);
  assert.match(source, /useState\(\(\) => productList\[0\]\?\.productId \? \[productList\[0\]\.productId\] : \[\]\)/);
  assert.match(source, /每次选择一项，逐项支付/);
  assert.doesNotMatch(source, /key: 'alipay', label: '支付宝'/);
});
