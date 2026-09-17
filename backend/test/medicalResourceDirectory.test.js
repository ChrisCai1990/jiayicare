const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('医院、医院科室和专家使用独立资源模型', () => {
  const institution = read('backend/src/models/MedicalInstitution.js');
  const department = read('backend/src/models/MedicalDepartment.js');
  const expert = read('backend/src/models/MedicalExpert.js');
  assert.match(institution, /campuses/);
  assert.match(institution, /campusDetails/);
  assert.match(institution, /contactTitle/);
  assert.match(department, /institutionId/);
  assert.match(expert, /expertise/);
  assert.match(expert, /linkedStaffId/);
});

test('Admin 提供医疗资源库且专家账号为可选关联', () => {
  const routes = read('backend/src/routes/settings.js');
  const page = read('admin/src/pages/settings/MedicalResourcesPage.jsx');
  const layout = read('admin/src/components/Layout.jsx');
  assert.match(routes, /medical-institutions/);
  assert.match(routes, /medical-departments/);
  assert.match(routes, /medical-experts/);
  assert.match(page, /不关联（外部专家）/);
  assert.match(page, /每个院区分别维护地址、联系人、职位和联系电话/);
  assert.match(page, /医院总联系人/);
  assert.match(layout, /医疗资源库/);
});

test('转介区分内部协作和外部医疗转介并冻结专家快照', () => {
  const referral = read('backend/src/models/Referral.js');
  const routes = read('backend/src/routes/staff.js');
  const page = read('staff/src/pages/PatientDetailPage.jsx');
  assert.match(referral, /external_medical/);
  assert.match(referral, /medicalExpertSnapshot/);
  assert.match(routes, /institutionName/);
  assert.match(page, /内部专业协作/);
  assert.match(page, /外部医疗转介/);
  assert.match(page, /擅长：/);
});
