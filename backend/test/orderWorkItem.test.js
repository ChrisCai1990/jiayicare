const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { activeOrderWorkItemQuery } = require('../src/utils/orderWorkItem');

test('工作台订单查询从底层排除退款和终态订单', () => {
  const query = activeOrderWorkItemQuery();
  assert.equal(query.paymentStatus, 'paid');
  assert.deepEqual(query.tradeStatus.$in, ['paid', 'fulfilling', 'partially_refunded']);
  assert.equal(query.tradeStatus.$in.includes('refund_pending'), false);
  assert.equal(query.tradeStatus.$in.includes('refunded'), false);
  assert.deepEqual(query.status.$in, ['pending', 'scheduled']);
});

test('退款成功会关闭订单产生的所有未完成待办', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/orderSettlement.js'), 'utf8');
  assert.match(source, /FollowUp\.updateMany\([\s\S]*sourceType: 'order'[\s\S]*cancelReason: '订单已退款'/);
});

test('医护工作台按有效订单ID约束订单待办', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  assert.match(source, /sourceType === 'order'[\s\S]*activeOrderWorkItemQuery\(\)[\s\S]*filter\.sourceOrderId = \{ \$in: activeOrderIds \}/);
  assert.match(source, /router\.patch\('\/orders\/:id\/start'[\s\S]*activeOrderWorkItemQuery\(\)/);
  assert.match(source, /desiredServiceDate serviceRequirements/);
});

test('会员详情读取前会按订单事实状态校正历史待办', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const start = source.indexOf("router.get('/patients/:id/followups'");
  const end = source.indexOf("router.get('/followups'", start);
  assert.match(source.slice(start, end), /reconcileInactiveOrderWorkItems\(req\.params\.id\)/);
});

test('后台取消订单同步取消关联待办', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/admin.js'), 'utf8');
  const start = source.indexOf("router.patch('/orders/:id/status'");
  const end = source.indexOf("router.patch('/orders/:id/pay'", start);
  const route = source.slice(start, end);
  assert.match(route, /FollowUp\.updateMany/);
  assert.match(route, /sourceType: 'order'/);
  assert.match(route, /cancelReason: '订单已取消'/);
});

test('启动扫描会清理年度方案重复排期并校正失效订单待办', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/scheduledFollowUpWindowScheduler.js'), 'utf8');
  assert.match(source, /dedupeAnnualPlanFollowUps\(\)/);
  assert.match(source, /reconcileInactiveOrderWorkItems\(\)/);
});
