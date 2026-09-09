const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const staffSource = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const userSource = fs.readFileSync(path.join(__dirname, '../src/routes/user.js'), 'utf8');

test('customer follow-up feed excludes both internal executor and supervisor tasks', () => {
  const start = userSource.indexOf("router.get('/followup-tasks'");
  const end = userSource.indexOf("router.patch('/followup-tasks/:id/done'", start);
  const route = userSource.slice(start, end);
  assert.match(route, /sourceType:\s*'health_plan',\s*taskRole:\s*\{\s*\$in:\s*\['executor',\s*'supervisor'\]/);
  assert.match(route, /\{ sourceType:\s*'order' \}/);
  assert.doesNotMatch(route, /customerReadOnly/);
});

test('service task endpoint returns explicitly assigned executor and supervisor tasks independently of follow-up permission', () => {
  const start = staffSource.indexOf("router.get('/service-tasks'");
  const end = staffSource.indexOf('// ── GET /api/staff/patients', start);
  const route = staffSource.slice(start, end);
  assert.ok(start >= 0);
  assert.match(route, /assignedTo:\s*req\.staff\._id/);
  assert.match(route, /taskRole:\s*\{\s*\$in:\s*\['executor',\s*'supervisor'\]/);
  assert.doesNotMatch(route, /checkPermission\('followups'/);
  assert.doesNotMatch(route, /assignedHealthManager|assignedMedicalAssistant/);
});

test('opening-order stage does not create a duplicate medical document collection supervisor task', () => {
  const pushStart = staffSource.indexOf("router.patch('/plans/:id/push'");
  const pushEnd = staffSource.indexOf("router.patch('/plans/:id/items/:itemId'", pushStart);
  const route = staffSource.slice(pushStart, pushEnd);
  assert.match(route, /开单\/预约阶段已经由“执行【代办服务】→督办【代办服务】”闭环/);
  assert.match(route, /资料回收属于实际就诊后的另一阶段/);
  assert.match(route, /开单阶段仅保留代办执行与督办/);
  assert.doesNotMatch(route, /documentCollectionName = '就医资料回收'/);
});
