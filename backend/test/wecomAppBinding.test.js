const test = require('node:test');
const assert = require('node:assert/strict');

test('employee request needs admin confirmation and cannot remove a changed binding', async t => {
  const Link = require('../src/models/WecomAppLink');
  const original = Link.findOneAndUpdate;
  t.after(() => { Link.findOneAndUpdate = original; });
  const row = { staffId: 'staff-1', tenantId: 'tenant-1', corpId: 'corp-1', userId: 'wecom-1', remindersEnabled: true };
  Link.findOneAndUpdate = (filter, update) => ({
    select() { return this; },
    async lean() {
      const matches = Object.entries(filter).every(([key, value]) =>
        value?.$exists !== undefined ? (key in row) === value.$exists : row[key] === value);
      if (!matches) return null;
      Object.assign(row, update.$set);
      for (const key of Object.keys(update.$unset || {})) delete row[key];
      return { _id: 'link-1' };
    },
  });
  const { requestUnbind, confirmUnbind } = require('../src/utils/wecomAppBinding');
  const args = { staffId: 'staff-1', tenantId: 'tenant-1', corpId: 'corp-1', expectedUserId: 'wecom-1' };
  assert.equal(await confirmUnbind({ ...args, actorId: 'admin-1' }), false);
  assert.equal(await requestUnbind({ ...args, expectedUserId: 'old-wecom' }), false);
  assert.equal(await requestUnbind({ ...args, tenantId: 'other-tenant' }), false);
  assert.equal(await requestUnbind(args), true);
  assert.equal(row.userId, 'wecom-1');
  assert.equal(row.remindersEnabled, true);
  assert.equal(await requestUnbind(args), false);
  row.userId = 'wecom-2';
  assert.equal(await confirmUnbind({ ...args, actorId: 'admin-1' }), false);
  assert.equal(row.userId, 'wecom-2');
  row.userId = 'wecom-1';
  assert.equal(await confirmUnbind({ ...args, actorId: 'admin-1' }), true);
  assert.equal(row.userId, undefined);
  assert.equal(row.remindersEnabled, false);
  assert.equal(row.lastUnboundBy, 'admin-1');
  assert.equal(await confirmUnbind({ ...args, actorId: 'admin-1' }), false);
});

test('Admin unbind is restricted to a superadmin and an employee in the current tenant', async t => {
  const Admin = require('../src/models/Admin');
  const binding = require('../src/utils/wecomAppBinding');
  const router = require('../src/routes/settings');
  const route = router.stack.find(layer => layer.route?.path === '/employees/:id/wecom-unbind' && layer.route.methods.post);
  assert.ok(route);
  const handler = route.route.stack.at(-1).handle;
  const oldFindById = Admin.findById;
  const oldUnbind = binding.confirmUnbind;
  const oldCorp = process.env.WECOM_CORP_ID;
  t.after(() => {
    Admin.findById = oldFindById;
    binding.confirmUnbind = oldUnbind;
    if (oldCorp === undefined) delete process.env.WECOM_CORP_ID;
    else process.env.WECOM_CORP_ID = oldCorp;
  });
  process.env.WECOM_CORP_ID = 'corp-1';
  const staffId = '0123456789abcdef01234567';
  let staff = { _id: staffId, role: 'healthPlanner' };
  Admin.findById = () => ({ select: () => ({ lean: async () => staff }) });
  let unbindArgs;
  binding.confirmUnbind = async args => { unbindArgs = args; return true; };
  const call = async role => {
    let result;
    const res = { status(code) { this.code = code; return this; }, json(body) { result = { code: this.code || 200, body }; } };
    await handler({ admin: { _id: 'admin-1', role, tenantId: 'tenant-1' }, params: { id: staffId }, body: { userId: 'wecom-1' } }, res);
    return result;
  };
  assert.equal((await call('healthManager')).code, 403);
  assert.equal(unbindArgs, undefined);
  staff = null;
  assert.equal((await call('superadmin')).code, 404);
  assert.equal(unbindArgs, undefined);
  staff = { _id: staffId, role: 'healthPlanner' };
  assert.equal((await call('superadmin')).code, 200);
  assert.deepEqual(unbindArgs, { staffId, tenantId: 'tenant-1', corpId: 'corp-1', expectedUserId: 'wecom-1', actorId: 'admin-1' });
});
