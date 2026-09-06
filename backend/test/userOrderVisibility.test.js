const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('用户订单列表隐藏后台标记的测试订单但不删除审计数据', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/orders.js'), 'utf8');
  const start = route.indexOf("router.get('/', auth");
  const end = route.indexOf("router.get('/pending-service-confirmation'", start);
  const listRoute = route.slice(start, end);
  assert.match(listRoute, /hiddenFromUser:\s*\{\s*\$ne:\s*true\s*\}/);
  assert.doesNotMatch(listRoute, /deleteMany|findByIdAndDelete/);
});

test('订单模型保留独立的客户侧隐藏标记', () => {
  const model = fs.readFileSync(path.join(__dirname, '../src/models/Order.js'), 'utf8');
  assert.match(model, /hiddenFromUser:\s*\{\s*type:\s*Boolean,\s*default:\s*false\s*\}/);
});
