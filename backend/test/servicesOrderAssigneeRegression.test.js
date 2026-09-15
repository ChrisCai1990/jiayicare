const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('all order entries use the shared health-planner supervisor resolver', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/services.js'), 'utf8');
  const userRoute = fs.readFileSync(path.join(__dirname, '../src/routes/user.js'), 'utf8');
  const ownership = fs.readFileSync(path.join(__dirname, '../src/utils/serviceOwnership.js'), 'utf8');
  assert.match(source, /serviceOwnership/);
  assert.match(userRoute, /serviceOwnership/);
  assert.match(ownership, /resolveOrderWorkflowAssignee: resolveServiceSupervisor/);
  assert.doesNotMatch(source, /住院一站式[\s\S]{0,200}assignedFamilyDoctor/);
});

test('orders persist initiator, supervisor, current stage and closure policy separately', () => {
  const model = fs.readFileSync(path.join(__dirname, '../src/models/Order.js'), 'utf8');
  for (const field of ['initiationSource', 'initiatedByStaff', 'supervisorId', 'currentStage', 'currentAssignee', 'closureMode', 'supervisionStatus']) {
    assert.match(model, new RegExp(`${field}:`));
  }
});

test('staged order workflows update progress without transferring the supervisor', () => {
  for (const file of ['medicalProxyWorkflow.js', 'medicationProxyWorkflow.js']) {
    const source = fs.readFileSync(path.join(__dirname, `../src/utils/${file}`), 'utf8');
    assert.match(source, /currentStage:/);
    assert.match(source, /currentAssignee:/);
    assert.match(source, /supervisionStatus:/);
    assert.doesNotMatch(source, /supervisorId:\s*assignee/);
  }
});

test('service workflow snapshots persist a configurable closure policy', () => {
  const model = fs.readFileSync(path.join(__dirname, '../src/models/Product.js'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/admin.js'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../../admin/src/pages/settings/SupplyWorkflowConfigPage.jsx'), 'utf8');
  for (const source of [model, route, page]) assert.match(source, /closureMode/);
});
