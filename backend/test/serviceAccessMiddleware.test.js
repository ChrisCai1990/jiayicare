const test = require('node:test');
const assert = require('node:assert/strict');
const resolver = require('../src/utils/serviceAccess');
const { checkServiceActive } = require('../src/middleware/checkServiceActive');
async function call(method, url, body) {
  let status = 200; let responseBody; let next = false;
  await checkServiceActive({ method, originalUrl: url, body, user: { _id: 'patient' } }, { status(value) { status = value; return this; }, json(value) { responseBody = value; return this; } }, () => { next = true; });
  return { status, body: responseBody, next };
}
test('已到期客户可查看并答复本人年度方案，白名单只匹配指定路径', async t => {
  t.mock.method(resolver, 'resolveServiceAccess', async () => ({ active: false, reason: '服务期已结束' }));
  assert.equal((await call('GET', '/api/user/annual-mgmt-plans?year=2027')).next, true);
  assert.equal((await call('PATCH', '/api/user/annual-mgmt-plans/000000000000000000000001/confirm')).next, true);
  assert.equal((await call('PATCH', '/api/user/annual-mgmt-plans/000000000000000000000001/return')).next, true);
  for (const [method, url] of [['POST', '/api/user/annual-mgmt-plans'], ['PATCH', '/api/user/annual-mgmt-plans/000000000000000000000001/confirm/other'], ['POST', '/api/records']]) assert.equal((await call(method, url)).status, 403);
});
test('服务有效放行，核验异常返回可重试503不回退旧日期', async t => {
  t.mock.method(resolver, 'resolveServiceAccess', async () => ({ active: true }));
  assert.equal((await call('POST', '/api/records')).next, true);
  resolver.resolveServiceAccess.mock.mockImplementation(async () => { throw Error('database unavailable'); });
  assert.equal((await call('POST', '/api/records')).status, 503);
  assert.equal((await call('GET', '/api/user/me')).next, true);
});
test('服务期未开始时仅允许补填常住地区，不放行其他资料更新', async t => {
  t.mock.method(resolver, 'resolveServiceAccess', async () => ({ active: false, reason: '服务期尚未开始' }));
  const residence = { province: '广东省', city: '深圳市', district: '宝安区' };
  assert.equal((await call('PUT', '/api/user/me', { residence })).next, true);
  for (const body of [
    { residence, name: '其他修改' },
    { residence: { province: '广东省', city: '' } },
    { residence: { ...residence, serviceExpiry: '2099-01-01' } },
    { residence: [] },
  ]) assert.equal((await call('PUT', '/api/user/me', body)).status, 403);
  assert.equal((await call('PUT', '/api/user/me/extra', { residence })).status, 403);
});
test('确认白名单不允许到期客户启动首次方案，仅续年可提前确认', async t => {
  const { assertAnnualConfirmationAccess } = require('../src/utils/annualPlanConfirmation');
  t.mock.method(resolver, 'resolveServiceAccess', async () => ({ active: false }));
  await assert.rejects(assertAnnualConfirmationAccess({}, {}), { statusCode: 403 });
  await assertAnnualConfirmationAccess({ continuitySource: { previousPlanId: 'old' } }, {});
  resolver.resolveServiceAccess.mock.mockImplementation(async () => ({ active: true }));
  await assertAnnualConfirmationAccess({}, {});
});
