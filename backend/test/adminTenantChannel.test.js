const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const Admin = require('../src/models/Admin');
const Tenant = require('../src/models/Tenant');
const adminAuth = require('../src/middleware/adminAuth');

test('institution Admin requires the paid admin channel', async () => {
  const oldSecret = process.env.JWT_SECRET;
  const originalAdminFind = Admin.findById;
  const originalTenantFind = Tenant.findById;
  process.env.JWT_SECRET = 'synthetic-admin-channel-test';
  const id = '507f1f77bcf86cd799439011';
  const tenantId = '507f1f77bcf86cd799439012';
  const admin = { _id: id, role: 'superadmin', tenantId, mustChangePassword: false };
  let tenant = { status: 'active', code: 'mingdahealth', serviceScope: ['staff'] };
  Admin.findById = () => ({ select: async () => admin });
  Tenant.findById = () => ({ select: () => ({ lean: async () => tenant }) });
  const request = { headers: { authorization: `Bearer ${jwt.sign({ id, type: 'admin' }, process.env.JWT_SECRET)}` }, originalUrl: '/api/admin/saas-plan' };
  const call = () => new Promise(resolve => {
    const result = { status: 200, next: false };
    const response = { status(code) { result.status = code; return this; }, json(body) { result.message = body.message; resolve(result); } };
    adminAuth(request, response, () => { result.next = true; resolve(result); });
  });
  try {
    assert.equal((await call()).status, 403);
    tenant = { ...tenant, serviceScope: ['admin', 'staff'] };
    assert.equal((await call()).next, true);
    tenant = { status: 'active', code: 'jiayihui' };
    assert.equal((await call()).next, true);
  } finally {
    Admin.findById = originalAdminFind;
    Tenant.findById = originalTenantFind;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});
