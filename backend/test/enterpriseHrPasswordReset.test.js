const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const router = require('../src/routes/admin');
const Admin = require('../src/models/Admin');
const enterpriseHrAuth = require('../src/middleware/enterpriseHrAuth');
const hrRouter = require('../src/routes/enterpriseHr');

const route = router.stack.find(layer => layer.route?.path === '/enterprises/:id/hr-accounts/:hrId/reset-password' && layer.route.methods.patch);
assert.ok(route, 'HR password reset route exists');
const resetPassword = route.route.stack.at(-1).handle;

async function call({ role = 'superadmin', enterpriseId = 'enterprise-1', hrId = 'hr-1', password = 'new-secret' } = {}) {
  let result;
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(body) { result = { status: this.statusCode || 200, body }; return this; },
  };
  await resetPassword({ admin: { role }, params: { id: enterpriseId, hrId }, body: { password } }, response);
  return result;
}

test('only a superadmin can reset a password of an HR account in the selected enterprise', async () => {
  const originalFindOne = Admin.findOne;
  const queries = [];
  const hr = { password: 'old-secret', mustChangePassword: true, hrTokenVersion: 0, saved: false, async save() { this.saved = true; } };
  Admin.findOne = async query => {
    queries.push(query);
    return query.enterpriseId === 'enterprise-1' && query._id === 'hr-1' ? hr : null;
  };
  try {
    assert.equal((await call({ role: 'manager' })).status, 403);
    assert.equal((await call({ password: 'short' })).status, 400);
    assert.equal(queries.length, 0);
    assert.equal((await call({ enterpriseId: 'another-enterprise' })).status, 404);
    assert.equal((await call({ hrId: 'another-hr' })).status, 404);
    assert.equal((await call()).status, 200);
    assert.deepEqual(queries.at(-1), { _id: 'hr-1', enterpriseId: 'enterprise-1', role: 'enterprise_hr' });
    assert.equal(hr.password, 'new-secret');
    assert.equal(hr.mustChangePassword, true);
    assert.equal(hr.hrTokenVersion, 1);
    assert.equal(hr.saved, true);
  } finally {
    Admin.findOne = originalFindOne;
  }
});

test('reset invalidates previously issued HR tokens', async () => {
  const originalFindById = Admin.findById;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'synthetic-hr-reset-test';
  const hr = { role: 'enterprise_hr', enterpriseId: 'enterprise-1', staffStatus: 'active', hrTokenVersion: 1 };
  Admin.findById = () => ({ select: async () => hr });
  const check = version => new Promise(resolve => {
    const token = jwt.sign({ id: 'hr-1', type: 'admin', hrTokenVersion: version }, process.env.JWT_SECRET);
    const response = { status(code) { this.code = code; return this; }, json(body) { resolve({ status: this.code, message: body.message }); } };
    enterpriseHrAuth({ headers: { authorization: `Bearer ${token}` } }, response, () => resolve({ status: 200 }));
  });
  try {
    assert.deepEqual(await check(0), { status: 401, message: '密码已重置，请重新登录' });
    assert.deepEqual(await check(1), { status: 200 });
  } finally {
    Admin.findById = originalFindById;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test('first login requires password change and changing it renews the token', async () => {
  const originalFindById = Admin.findById;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'synthetic-hr-first-login-test';
  const hr = { _id: 'hr-1', role: 'enterprise_hr', enterpriseId: 'enterprise-1', staffStatus: 'active', mustChangePassword: true, hrTokenVersion: 1, password: 'temporary', comparePassword: async value => value === 'temporary', async save() {} };
  Admin.findById = () => ({ select: async () => hr, then: (resolve, reject) => Promise.resolve(hr).then(resolve, reject) });
  const oldToken = jwt.sign({ id: hr._id, type: 'admin', hrTokenVersion: 1 }, process.env.JWT_SECRET);
  const auth = path => new Promise(resolve => {
    const response = { status(code) { this.code = code; return this; }, json(body) { resolve({ status: this.code, message: body.message }); } };
    enterpriseHrAuth({ headers: { authorization: `Bearer ${oldToken}` }, originalUrl: path }, response, () => resolve({ status: 200 }));
  });
  const changeRoute = hrRouter.stack.find(layer => layer.route?.path === '/me/password' && layer.route.methods.put).route.stack.at(-1).handle;
  try {
    assert.deepEqual(await auth('/api/enterprise-hr/overview'), { status: 403, message: '请先修改初始密码' });
    assert.deepEqual(await auth('/api/enterprise-hr/me/password'), { status: 200 });
    let result;
    const response = { status(code) { this.code = code; return this; }, json(body) { result = { status: this.code || 200, body }; } };
    await changeRoute({ admin: hr, body: { oldPassword: 'wrong', newPassword: 'new-password-123' } }, response);
    assert.equal(result.status, 400);
    response.code = undefined;
    await changeRoute({ admin: hr, body: { oldPassword: 'temporary', newPassword: 'new-password-123' } }, response);
    assert.equal(result.status, 200);
    assert.equal(hr.mustChangePassword, false);
    assert.equal(hr.hrTokenVersion, 2);
    assert.equal(jwt.verify(result.body.data.token, process.env.JWT_SECRET).hrTokenVersion, 2);
    assert.deepEqual(await auth('/api/enterprise-hr/overview'), { status: 401, message: '密码已重置，请重新登录' });
  } finally {
    Admin.findById = originalFindById;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
