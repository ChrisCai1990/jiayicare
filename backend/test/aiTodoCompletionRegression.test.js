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

  assert.match(todoRoute, /aiStatus: 'pending',[\s\S]*audit_status: \{ \$ne: 'audited' \}/);
});
