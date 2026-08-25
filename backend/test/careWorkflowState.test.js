const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AnnualPlan = require('../src/models/AnnualPlan');
const HealthPlan = require('../src/models/HealthPlan');
const Order = require('../src/models/Order');

test('annual and intervention plans retain explicit customer confirmation states', () => {
  const annual = new AnnualPlan({ patientId: '64b000000000000000000001', planType: 'health_prevention' });
  const intervention = new HealthPlan({ patientId: '64b000000000000000000001', staffId: '64b000000000000000000002', type: 'nutrition', title: 'test' });
  assert.equal(annual.customerStatus, 'draft');
  assert.equal(annual.version, 1);
  assert.equal(intervention.customerStatus, 'draft');
});

test('service orders start in the planner workflow without changing commission ownership', () => {
  const order = new Order({
    user: '64b000000000000000000001', serviceId: 'svc', serviceName: '就医协助',
    serviceWorkflowStatus: 'pending_planner',
  });
  assert.equal(order.serviceWorkflowStatus, 'pending_planner');
  assert.equal(order.assignedServiceStaff, null);
  assert.equal(order.fulfillerId, null);
});

test('routes enforce confirmation before annual follow-up generation and actual completion before hospital records', () => {
  const staffSource = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const userSource = fs.readFileSync(path.join(__dirname, '../src/routes/user.js'), 'utf8');
  assert.match(userSource, /customerStatus = 'confirmed'[\s\S]*syncAnnualPlanFollowUps\(plan\)/);
  assert.doesNotMatch(staffSource.slice(staffSource.indexOf("router.put('/patients/:id/annual-plan'"), staffSource.indexOf("router.patch('/patients/:id/annual-plan/push'")), /syncAnnualPlanFollowUps\(plan\)/);
  assert.match(staffSource, /if \(followUp\.status === 'completed' && followUp\.sourceHealthPlanId\)[\s\S]*type: 'medical_visit'/);
  assert.match(staffSource, /medical_assist_plan_review:\s*'healthPlanner'/);
  assert.match(staffSource, /medical_assist_plan_changes:\s*'medicalAssistant'/);
});
