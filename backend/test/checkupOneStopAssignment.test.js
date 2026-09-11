const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const staffRoute = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const staffPage = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PlanModulesPage.jsx'), 'utf8');

test('checkup one-stop requires distinct booking planner and escort selections', () => {
  assert.match(staffPage, /bookingPlannerId[^\n]+体检预约负责人（健康规划师）[^\n]+healthPlanner/);
  assert.match(staffPage, /escortStaffId[^\n]+陪同人员[^\n]+medicalAssistant/);
  assert.match(staffRoute, /bookingPlannerId[^\n]+role: 'healthPlanner'/);
  assert.match(staffRoute, /escortStaffId[^\n]+role: 'medicalAssistant'/);
});

test('checkup one-stop keeps booking assignment separate from the Admin-driven final supervisor', () => {
  assert.match(staffPage, /!checkupService && !visit\.supervisorId/);
  assert.match(staffPage, /\{!isCheckupService && <div>/);
  assert.match(staffRoute, /!isCheckupService && !c\.supervisorId/);
  assert.match(staffRoute, /workflowPlan\.workflowTaskRole === 'supervisor'/);
  assert.match(staffRoute, /总督办\$\{workflowPlan\.name\}/);
});

test('workflow tasks honor explicit checkup assignees', () => {
  assert.match(staffRoute, /workflowPlan\.executorRole === 'healthPlanner'[\s\S]+c\.bookingPlannerId/);
  assert.match(staffRoute, /workflowPlan\.executorRole === 'medicalAssistant'[\s\S]+c\.escortStaffId/);
  assert.match(staffRoute, /explicitCheckupAssignee \|\| resolveAssignee/);
});

test('abnormal conditional nodes show health-consultant review before report evidence arrives', () => {
  assert.match(staffPage, /item\.trigger === 'exam_order_found' \? 'healthPlanner' : 'familyDoctor'/);
  assert.match(staffRoute, /configured\.mode === 'conditional' \? 'familyDoctor'/);
});
