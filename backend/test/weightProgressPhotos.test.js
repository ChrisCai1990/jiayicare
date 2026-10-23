const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');
const HealthPlan = require('../src/models/HealthPlan');
const StaffRole = require('../src/models/StaffRole');
const { __test } = require('../src/routes/weightProgressPhotos');

const patientId = '507f1f77bcf86cd799439011';
const tenantId = '507f1f77bcf86cd799439012';
const otherStaff = '507f1f77bcf86cd799439013';
const owner = '507f1f77bcf86cd799439014';
function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test('staff photo access requires both tenant and direct care assignment', async () => {
  const original = User.findOne;
  let filter;
  User.findOne = query => { filter = query; return { select: () => ({ lean: async () => ({ _id: patientId, tenantId, assignedNutritionist: owner }) }) }; };
  try {
    const denied = response();
    const result = await __test.staffPatient({ params: { patientId }, staff: { _id: otherStaff, tenantId, role: 'nutritionist' } }, denied);
    assert.equal(result, null);
    assert.equal(denied.code, 403);
    assert.equal(String(filter.tenantId), tenantId);
    const allowed = response();
    const patient = await __test.staffPatient({ params: { patientId }, staff: { _id: owner, tenantId, role: 'nutritionist' } }, allowed);
    assert.equal(String(patient._id), patientId);
  } finally { User.findOne = original; }
});

test('photo can only be associated with this patient nutrition plan', async () => {
  const original = HealthPlan.findOne;
  let filter;
  HealthPlan.findOne = query => { filter = query; return { select: () => ({ lean: async () => null }) }; };
  try {
    const res = response();
    assert.equal(await __test.planFor({ _id: patientId }, otherStaff, res), false);
    assert.equal(res.code, 400);
    assert.equal(String(filter.patientId), patientId);
    assert.equal(filter.type, 'nutrition');
  } finally { HealthPlan.findOne = original; }
});

test('image content must match declared format', () => {
  assert.equal(__test.validImage(Buffer.from('89504e470d0a1a0a', 'hex'), 'image/png'), true);
  assert.equal(__test.validImage(Buffer.from('not an image'), 'image/png'), false);
});

test('assigned nutritionist may edit photos with nutrition plan edit permission', async () => {
  const original = StaffRole.findById;
  StaffRole.findById = () => ({ select: () => ({ lean: async () => ({ permissions: {
    patients: { view: true, edit: false }, plans: { edit: true, planTypes: { nutrition: true } },
  } }) }) });
  try {
    const res = response();
    let passed = false;
    await __test.checkStaffPhotoEdit({ staff: { role: 'nutritionist', customRoleId: owner } }, res, () => { passed = true; });
    assert.equal(passed, true);
    assert.equal(res.code, 200);
  } finally { StaffRole.findById = original; }
});

test('nutritionist with nutrition plan permission disabled cannot edit photos', async () => {
  const original = StaffRole.findById;
  StaffRole.findById = () => ({ select: () => ({ lean: async () => ({ permissions: {
    patients: { view: true, edit: false }, plans: { edit: true, planTypes: { nutrition: false } },
  } }) }) });
  try {
    const res = response();
    let passed = false;
    await __test.checkStaffPhotoEdit({ staff: { role: 'nutritionist', customRoleId: owner } }, res, () => { passed = true; });
    assert.equal(passed, false);
    assert.equal(res.code, 403);
  } finally { StaffRole.findById = original; }
});

test('existing patient edit permission still allows nutritionist photo edits', async () => {
  const original = StaffRole.findById;
  StaffRole.findById = () => ({ select: () => ({ lean: async () => ({ permissions: {
    patients: { edit: true }, plans: { edit: false },
  } }) }) });
  try {
    let passed = false;
    await __test.checkStaffPhotoEdit({ staff: { role: 'nutritionist', customRoleId: owner } }, response(), () => { passed = true; });
    assert.equal(passed, true);
  } finally { StaffRole.findById = original; }
});
