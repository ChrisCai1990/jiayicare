const test = require('node:test');
const assert = require('node:assert/strict');

const StaffRole = require('../src/models/StaffRole');
const { checkPermissionStrict, checkAnyPermissionStrict } = require('../src/middleware/checkPermission');

function responseProbe() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function stubRoleLookup(value, error = null) {
  const original = StaffRole.findById;
  StaffRole.findById = () => ({
    select: () => ({
      lean: async () => {
        if (error) throw error;
        return value;
      },
    }),
  });
  return () => { StaffRole.findById = original; };
}

test('legacy staff without a custom role remain compatible', async () => {
  let nextCalled = false;
  await checkPermissionStrict('reports', 'audit')(
    { staff: { role: 'healthManager', customRoleId: null } },
    responseProbe(),
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);
});

test('a configured report reviewer must have explicit audit permission', async () => {
  const restore = stubRoleLookup({ permissions: { reports: { audit: false } } });
  try {
    const res = responseProbe();
    let nextCalled = false;
    await checkPermissionStrict('reports', 'audit')(
      { staff: { role: 'healthManager', customRoleId: 'role-a' } }, res,
      () => { nextCalled = true; },
    );
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  } finally { restore(); }
});

test('an explicitly authorized custom role can review reports', async () => {
  const restore = stubRoleLookup({ permissions: { reports: { audit: true } } });
  try {
    let nextCalled = false;
    await checkPermissionStrict('reports', 'audit')(
      { staff: { role: 'healthManager', customRoleId: 'role-a' } }, responseProbe(),
      () => { nextCalled = true; },
    );
    assert.equal(nextCalled, true);
  } finally { restore(); }
});

test('a deleted custom role fails closed for report audit', async () => {
  const restore = stubRoleLookup(null);
  try {
    const res = responseProbe();
    await checkPermissionStrict('reports', 'audit')(
      { staff: { role: 'healthManager', customRoleId: 'missing-role' } }, res, () => {},
    );
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /角色已失效/);
  } finally { restore(); }
});

test('permission storage errors fail closed for medical report mutations', async () => {
  const restore = stubRoleLookup(null, new Error('database unavailable'));
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = responseProbe();
    await checkPermissionStrict('reports', 'audit')(
      { staff: { role: 'healthManager', customRoleId: 'role-a' } }, res, () => {},
    );
    assert.equal(res.statusCode, 503);
    assert.match(res.body.message, /权限校验暂时不可用/);
  } finally {
    console.error = originalError;
    restore();
  }
});

test('report upload accepts the new create permission', async () => {
  const restore = stubRoleLookup({ permissions: { reports: { create: true, audit: false } } });
  try {
    let nextCalled = false;
    await checkAnyPermissionStrict('reports', ['create', 'audit'])(
      { staff: { role: 'healthManager', customRoleId: 'uploader-role' } }, responseProbe(),
      () => { nextCalled = true; },
    );
    assert.equal(nextCalled, true);
  } finally { restore(); }
});

test('existing reviewer roles retain upload access without a create field', async () => {
  const restore = stubRoleLookup({ permissions: { reports: { audit: true } } });
  try {
    let nextCalled = false;
    await checkAnyPermissionStrict('reports', ['create', 'audit'])(
      { staff: { role: 'healthManager', customRoleId: 'legacy-reviewer-role' } }, responseProbe(),
      () => { nextCalled = true; },
    );
    assert.equal(nextCalled, true);
  } finally { restore(); }
});

test('view-only custom roles cannot upload health originals', async () => {
  const restore = stubRoleLookup({ permissions: { reports: { view: true } } });
  try {
    const res = responseProbe();
    await checkAnyPermissionStrict('reports', ['create', 'audit'])(
      { staff: { role: 'healthManager', customRoleId: 'viewer-role' } }, res, () => {},
    );
    assert.equal(res.statusCode, 403);
  } finally { restore(); }
});

test('a deleted custom role fails closed when reading medical reports', async () => {
  const restore = stubRoleLookup(null);
  try {
    const res = responseProbe();
    await checkPermissionStrict('reports', 'view')(
      { staff: { role: 'healthManager', customRoleId: 'missing-viewer-role' } }, res, () => {},
    );
    assert.equal(res.statusCode, 403);
  } finally { restore(); }
});

test('permission storage errors fail closed when reading medical reports', async () => {
  const restore = stubRoleLookup(null, new Error('database unavailable'));
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = responseProbe();
    await checkPermissionStrict('reports', 'view')(
      { staff: { role: 'healthManager', customRoleId: 'viewer-role' } }, res, () => {},
    );
    assert.equal(res.statusCode, 503);
  } finally {
    console.error = originalError;
    restore();
  }
});
