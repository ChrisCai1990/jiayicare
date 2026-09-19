const test = require('node:test');
const assert = require('node:assert/strict');
const resolver = require('../src/utils/serviceAccess');
const { checkServiceActive } = require('../src/middleware/checkServiceActive');
async function call(method, url) {
  let status = 200; let body; let next = false;
  await checkServiceActive({ method, originalUrl: url, user: { _id: 'patient' } }, { status(value) { status = value; return this; }, json(value) { body = value; return this; } }, () => { next = true; });
  return { status, body, next };
}
test('已到期客户可查看与确认本人年度方案，白名单只匹配指定路径', async t => {
  t.mock.method(resolver, 'resolveServiceAccess', async () => ({ active: false, reason: '服务期已结束' }));
  assert.equal((await call('GET', '/api/user/annual-mgmt-plans?year=2027')).next, true);
  assert.equal((await call('PATCH', '/api/user/annual-mgmt-plans/000000000000000000000001/confirm')).next, true);
  for (const [method, url] of [['POST', '/api/user/annual-mgmt-plans'], ['PATCH', '/api/user/annual-mgmt-plans/000000000000000000000001/confirm/other'], ['POST', '/api/records']]) assert.equal((await call(method, url)).status, 403);
});
test('服务有效放行，核验异常返回可重试503不回退旧日期', async t => {
  t.mock.method(resolver, 'resolveServiceAccess', async () => ({ active: true }));
  assert.equal((await call('POST', '/api/records')).next, true);
  resolver.resolveServiceAccess.mock.mockImplementation(async () => { throw Error('database unavailable'); });
  assert.equal((await call('POST', '/api/records')).status, 503);
  assert.equal((await call('GET', '/api/user/me')).next, true);
});
test('确认白名单不允许到期客户启动首次方案，仅续年可提前确认', async t => {
  const { assertAnnualConfirmationAccess } = require('../src/utils/annualPlanConfirmation');
  t.mock.method(resolver, 'resolveServiceAccess', async () => ({ active: false }));
  await assert.rejects(assertAnnualConfirmationAccess({}, {}), { statusCode: 403 });
  await assertAnnualConfirmationAccess({ continuitySource: { previousPlanId: 'old' } }, {});
  resolver.resolveServiceAccess.mock.mockImplementation(async () => ({ active: true }));
  await assertAnnualConfirmationAccess({}, {});
});
