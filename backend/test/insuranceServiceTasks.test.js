const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const serviceTasks = route.slice(route.indexOf("router.get('/service-tasks'"), route.indexOf('// ── GET /api/staff/patients'));
const createCase = route.slice(route.indexOf("router.post('/patients/:id/insurance-cases'"), route.indexOf("router.patch('/insurance-cases/:caseId"));

test('open insurance cases self-heal into the current manager or planner workbench', () => {
  assert.match(route, /async function ensureOpenInsuranceTasksForStaff/);
  assert.match(route, /staff\.role === 'healthPlanner' \? 'supervisor'/);
  assert.match(route, /staff\.role === 'healthManager' \? 'executor'/);
  assert.match(serviceTasks, /await ensureOpenInsuranceTasksForStaff\(req\.staff\)/);
  assert.match(serviceTasks, /\['executor', 'supervisor'\]\.includes\(task\.taskRole\)/);
});

test('creating an insurance case assigns work to both configured roles', () => {
  assert.match(createCase, /assignedHealthManager assignedHealthPlanner/);
  assert.match(createCase, /ensureInsuranceServiceTask\(serviceCase, 'executor', assignee\)/);
  assert.match(createCase, /ensureInsuranceServiceTask\(serviceCase, 'supervisor', patient\.assignedHealthPlanner\)/);
});

test('insurance task repair is idempotent for each case and role', () => {
  assert.match(route, /sourceId: serviceCase\._id, taskRole, status: \{ \$in: \['planned', 'in_progress', 'missed'\] \}/);
  assert.match(route, /new: true, upsert: true, setDefaultsOnInsert: true/);
});
