const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const staffRouteSource = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');

test('approving a medical report closes both historical review states', () => {
  const auditRoute = staffRouteSource.slice(
    staffRouteSource.indexOf("router.patch('/medical-reports/:id/audit'"),
    staffRouteSource.indexOf("router.get('/patients/:id/reports/pending-doctor-audit'"),
  );

  assert.match(auditRoute, /report\.audit_status = 'audited'/);
  assert.match(auditRoute, /report\.aiStatus = 'reviewed'/);
  assert.match(auditRoute, /report\.reviewedByStaff = req\.staff\._id/);
});

test('AI todo aggregation excludes reports already audited through a legacy path', () => {
  const todoRoute = staffRouteSource.slice(
    staffRouteSource.indexOf("router.get('/ai-todos'"),
    staffRouteSource.indexOf('// ── 健康顾问：健康档案待查看确认'),
  );

  assert.match(todoRoute, /aiStatus: 'pending'[\s\S]*audit_status: \{ \$nin: \['audited', 'rejected'\] \}/);
});

test('AI todo aggregation keeps medical reports inside the current staff ownership scope', () => {
  const todoRoute = staffRouteSource.slice(
    staffRouteSource.indexOf("router.get('/ai-todos'"),
    staffRouteSource.indexOf("router.patch('/service-proposals/:id/review'"),
  );

  assert.doesNotMatch(todoRoute, /reportPatientIds/);
  assert.match(todoRoute, /const parseFilter = \{[\s\S]*user: \{ \$in: myPatientIds \}/);
  assert.match(todoRoute, /const reportFilter = \{[\s\S]*user: \{ \$in: myPatientIds \}/);
});

test('AI todo aggregation applies one final ownership gate to every non-superadmin task', () => {
  const todoRoute = staffRouteSource.slice(
    staffRouteSource.indexOf("router.get('/ai-todos'"),
    staffRouteSource.indexOf("router.patch('/service-proposals/:id/review'"),
  );

  assert.match(todoRoute, /const scopedTodos = isSuper \? todos : todos\.filter\(todo => inMyScope\(todo\.patientId\)\)/);
  assert.match(todoRoute, /data: scopedTodos, total: scopedTodos\.length/);
});

test('AI todo ownership is strict to the signed-in staff member and does not expand to teams or subordinates', () => {
  const todoRoute = staffRouteSource.slice(
    staffRouteSource.indexOf("router.get('/ai-todos'"),
    staffRouteSource.indexOf("router.patch('/service-proposals/:id/review'"),
  );

  assert.match(todoRoute, /User\.find\(\{[\s\S]*\[assignField\]: req\.staff\._id,[\s\S]*isDeleted: \{ \$ne: true \}/);
  assert.doesNotMatch(todoRoute, /getVisibleStaffIds\(req\.staff\)/);
});
