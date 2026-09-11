const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TEMPLATE_NORMALIZATION } = require('../src/scripts/normalizeMedicalAssistTemplates');
const { PRODUCT_NAME, WORKFLOW_PLANS, removeRedundantExpertBookingStage } = require('../src/scripts/migrateOutpatientOneStopWorkflowV5');

test('门诊一站式是完整多阶段服务，不是单次代办', () => {
  assert.equal(PRODUCT_NAME, '门诊一站式服务');
  assert.equal(WORKFLOW_PLANS.length, 6);
  const names = WORKFLOW_PLANS.map(item => item.name).join('\n');
  for (const expected of ['资料收集与核对', '健康顾问评估及医院专家确定', '代诊约诊服务', '执行人员安排', '首次代诊开检查单', '检查及专家门诊陪诊与归档']) assert.match(names, new RegExp(expected));
  assert.doesNotMatch(names, /检查日专家号预约/);
  assert.equal(typeof removeRedundantExpertBookingStage, 'function');
  const migration = fs.readFileSync(path.join(__dirname, '../src/scripts/migrateOutpatientOneStopWorkflowV5.js'), 'utf8');
  assert.match(migration, /theme: \{ \$regex: '门诊一站式\.\*检查日专家号预约' \}/);
  assert.match(migration, /status: \{ \$in: \['draft', 'active'\] \}/);
  const deploy = fs.readFileSync(path.join(__dirname, '../../scripts/deploy.py'), 'utf8');
  assert.match(deploy, /migrateOutpatientRemoveDuplicateBookingV10\.js/);
  assert.match(deploy, /\.outpatient-remove-duplicate-booking-v10-applied/);
  assert.match(deploy, /migrateOutpatientStaffAssignmentV11\.js/);
  assert.match(deploy, /\.outpatient-staff-assignment-v11-applied/);
  assert.ok(WORKFLOW_PLANS.every(item => item.executorRole));
  assert.deepEqual(WORKFLOW_PLANS.slice(0, 2).map(item => item.executorRole), ['healthManager', 'familyDoctor']);
  assert.match(WORKFLOW_PLANS[0].name, /资料收集/);
  assert.match(WORKFLOW_PLANS[0].completionStandard, /报告已上传归档.*资料完整性已审核/);
  assert.match(WORKFLOW_PLANS[1].name, /健康顾问评估.*医院专家/);
  const template = TEMPLATE_NORMALIZATION[PRODUCT_NAME];
  assert.match(template.applicableScenario, /首次代诊开单、检查预约/);
  assert.match(template.completionStandard, /门诊病历与检查单已上传归档/);
  assert.match(template.applicableScenario, /单次购买/);
  assert.match(template.applicableScenario, /年度会员.*代办、代诊或陪诊/);
});

test('健康规划师总览督办，岗位完成后直接串行解锁下一环节', () => {
  const assignment = WORKFLOW_PLANS.find(item => /执行人员安排/.test(item.name));
  assert.equal(assignment.executorRole, 'healthPlanner');
  assert.equal(assignment.requiresCoordination, false);
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  assert.match(route, /supervisorRole \|\| 'healthPlanner'/);
  assert.match(route, /dependsOnTaskId: options\.dependsOnTaskId \|\| null/);
  assert.match(route, /activationEvent: executorBlocked \? 'previous_stage_approved'/);
  assert.match(route, /completedGateId = supervisor\?\._id \|\| followUp\._id/);
  assert.match(route, /deferMedicalAssistantAssignment: isOutpatientOneStop/);
  assert.match(route, /!c\.serviceDate && !isOutpatientOneStop/);
});

test('约诊完成后由健康规划师分别安排两类就医专员', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const form = fs.readFileSync(path.join(__dirname, '../../staff/src/components/OutpatientStaffAssignmentForm.jsx'), 'utf8');
  const patientPage = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PatientDetailPage.jsx'), 'utf8');
  const followUpsPage = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/FollowUpsPage.jsx'), 'utf8');
  for (const field of ['proxyVisitStaffId', 'escortStaffId']) {
    assert.match(form, new RegExp(field));
    assert.match(route, new RegExp(field));
  }
  assert.match(route, /role: 'medicalAssistant', staffStatus: 'active'/);
  assert.match(route, /首次代诊开检查单/);
  assert.match(route, /检查及专家门诊陪诊与归档/);
  assert.match(patientPage, /OutpatientStaffAssignmentForm/);
  assert.match(followUpsPage, /OutpatientStaffAssignmentForm/);
  assert.match(form, /健管专员已确认的门诊预约/);
  assert.match(form, /dependsOnTaskId\?\.formData/);
  assert.match(patientPage, /OutpatientStaffAssignmentForm task=\{execItem\}/);
  assert.match(followUpsPage, /OutpatientStaffAssignmentForm task=\{execItem\}/);
});

test('门诊一站式任务不会因执行角色相同而误用体检表单', () => {
  const checkupForm = fs.readFileSync(path.join(__dirname, '../../staff/src/components/CheckupBookingForm.jsx'), 'utf8');
  assert.match(checkupForm, /isCheckupServiceTask/);
  assert.match(checkupForm, /if \(\/门诊一站式\/\.test\(text\)\) return false/);
  assert.match(checkupForm, /content\.serviceDomain === 'annual_checkup'/);
  assert.match(checkupForm, /isCheckupServiceTask\(task\)[\s\S]*executorRole === 'healthPlanner'/);
});

test('首次代诊读取代诊日信息并完成检查预约', () => {
  const booking = fs.readFileSync(path.join(__dirname, '../../staff/src/components/OutpatientAppointmentForm.jsx'), 'utf8');
  const proxy = fs.readFileSync(path.join(__dirname, '../../staff/src/components/OutpatientProxyVisitForm.jsx'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  assert.match(booking, /campus/);
  for (const text of ['健管专员确认的代诊日信息', 'proxyVisitCompleted', 'examOrderSummary', 'checkAppointments', 'bookingSnapshot']) assert.match(`${proxy}\n${route}`, new RegExp(text));
  assert.match(proxy, /const saved = value \|\| \{\}/);
});

test('健康顾问环节使用结构化就医评估并由后端校验', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const form = fs.readFileSync(path.join(__dirname, '../../staff/src/components/OutpatientAdvisorAssessmentForm.jsx'), 'utf8');
  for (const field of ['recommendedHospital', 'recommendedDepartment', 'recommendedExpert', 'expectedChecks', 'prescribingVisitRequirements', 'coveredChecks', 'department', 'expertRequired', 'expertName', 'communicationRequired', 'communicationContent']) {
    assert.match(form, new RegExp(field));
    assert.match(route, new RegExp(field));
  }
  assert.match(form, /健管专员已收集资料/);
  assert.match(form, /第一步：评估特殊检查、检查专家及同日看诊专家/);
  assert.match(form, /第二步：提出首次代诊开检查单建议/);
  assert.match(form, /完成评估并流转下一步|validateOutpatientAssessment/);
});

test('首次门诊预约展示顾问建议并保存实际预约安排', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const form = fs.readFileSync(path.join(__dirname, '../../staff/src/components/OutpatientAppointmentForm.jsx'), 'utf8');
  assert.match(route, /serviceChecklist formData executedContent/);
  assert.match(route, /formData: followUp\.formData \|\| null/);
  for (const text of ['确认开检查单门诊预约', '沟通并确认特殊检查专家的具体时间', '根据检查时间安排检查后的专家门诊', 'prescribingAppointments', 'specialCheckAppointments', 'postCheckAppointment', 'appointmentDate', 'appointmentTime', '确认预约并流转代诊']) {
    assert.match(`${form}\n${fs.readFileSync(path.join(__dirname, '../../staff/src/pages/FollowUpsPage.jsx'), 'utf8')}`, new RegExp(text));
  }
  assert.match(fs.readFileSync(path.join(__dirname, '../../staff/src/pages/FollowUpsPage.jsx'), 'utf8'), /安排代诊约诊服务/);
});

test('预约退回时跳过自动督办节点并恢复健康顾问执行任务', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  assert.match(route, /directPrevious\?\.taskRole === 'supervisor'/);
  assert.match(route, /returnGate\?\.dependsOnTaskId \|\| directPrevious\?\._id/);
  assert.match(route, /returnGate\.status = 'planned'[\s\S]*returnGate\.isBlocked = true/);
});
