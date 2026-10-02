const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const Admin = require('../src/models/Admin');
const Tenant = require('../src/models/Tenant');
const User = require('../src/models/User');
const staffAuth = require('../src/middleware/staffAuth');
const userAuth = require('../src/middleware/auth');

test('staff authentication requires an active institution and completed password setup', async () => {
  const oldSecret = process.env.JWT_SECRET;
  const originalAdminFind = Admin.findById;
  const originalTenantFind = Tenant.findById;
  process.env.JWT_SECRET = 'synthetic-tenant-auth-test';
  const id = '507f1f77bcf86cd799439011';
  const tenantId = '507f1f77bcf86cd799439012';
  let admin;
  let tenant;
  Admin.findById = () => ({ select: async () => admin });
  Tenant.findById = () => ({ select: () => ({ lean: async () => tenant }) });
  const request = { headers: { authorization: `Bearer ${jwt.sign({ id, type: 'admin' }, process.env.JWT_SECRET)}` } };
  async function call(method = 'GET', path = '/me') {
    return new Promise(resolve => {
      const result = { status: 200, next: false, message: '' };
      const response = { status(code) { result.status = code; return this; }, json(body) { result.message = body.message; resolve(result); } };
      staffAuth({ ...request, method, path, originalUrl: '/api/staff' + path }, response, () => { result.next = true; resolve(result); });
    });
  }
  try {
    admin = { _id: id, role: 'familyDoctor', tenantId: null };
    assert.equal((await call()).status, 403);
    admin.tenantId = tenantId;
    tenant = { status: 'suspended' };
    assert.equal((await call()).status, 403);
    tenant = { status: 'active', code: 'jiayihui' };
    admin.mustChangePassword = true;
    assert.equal((await call()).status, 403);
    assert.equal((await call('PUT', '/me/password')).next, true);
    assert.equal((await call('GET', '/me/password')).status, 403);
    assert.equal((await call('PUT', '/patients')).status, 403);
    admin.mustChangePassword = false;
    assert.equal((await call()).next, true);
    tenant = { status: 'active', code: 'mingdahealth', serviceScope: ['admin'] };
    assert.equal((await call()).status, 403);
    tenant.serviceScope.push('staff');
    assert.equal((await call()).next, true);
    tenant.status = 'setup';
    assert.equal((await call()).next, true);
    assert.equal((await call('GET', '/patients')).status, 403);
    assert.equal((await call('GET', '/notifications')).status, 403);
    admin.role = 'institutionStaff';
    assert.equal((await call()).next, true);
    assert.equal((await call('GET', '/patients')).status, 403);
  } finally {
    Admin.findById = originalAdminFind;
    Tenant.findById = originalTenantFind;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test('customer authentication rejects missing or suspended institution', async () => {
  const oldSecret = process.env.JWT_SECRET;
  const originalUserFind = User.findById;
  const originalTenantFind = Tenant.findById;
  process.env.JWT_SECRET = 'synthetic-customer-auth-test';
  const id = '507f1f77bcf86cd799439011';
  let user;
  let tenant;
  User.findById = () => ({ select: async () => user });
  Tenant.findById = () => ({ select: () => ({ lean: async () => tenant }) });
  const request = { headers: { authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` }, query: {} };
  async function call() {
    return new Promise(resolve => {
      const result = { status: 200, next: false };
      const response = { status(code) { result.status = code; return this; }, json() { resolve(result); }, set() { return this; } };
      userAuth({ ...request }, response, () => { result.next = true; resolve(result); });
    });
  }
  try {
    user = { _id: id, tenantId: null };
    assert.equal((await call()).status, 403);
    user.tenantId = '507f1f77bcf86cd799439012';
    tenant = { status: 'suspended' };
    assert.equal((await call()).status, 403);
    tenant = { status: 'active' };
    assert.equal((await call()).next, true);
  } finally {
    User.findById = originalUserFind;
    Tenant.findById = originalTenantFind;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});
