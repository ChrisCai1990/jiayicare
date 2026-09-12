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
  assert.doesNotMatch(names, /总督办与最终验收/);
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
  assert.match(route, /activationEvent: workflowPlan\.activationEvent \|\| \(executorBlocked \? 'previous_stage_approved' : ''\)/);
  assert.match(route, /completedGateIds = \[followUp\._id, !requiresFinalAcceptance \? supervisor\?\._id : null\]\.filter\(Boolean\)/);
  assert.match(route, /dependsOnTaskId: \{ \$in: completedGateIds \}/);
  assert.match(route, /deferMedicalAssistantAssignment: isOutpatientOneStop/);
  assert.match(route, /!c\.serviceDate && !isOutpatientOneStop/);
  assert.ok(!WORKFLOW_PLANS.some(item => item.workflowStageKey === 'final_acceptance'));
  assert.match(route, /isOutpatientPostVisitReview[\s\S]*completedPlan\?\.sourceOrderId/);
  assert.match(route, /tradeStatus: 'completed'/);
  const removeFinal = fs.readFileSync(path.join(__dirname, '../src/scripts/removeOutpatientFinalAcceptanceV17.js'), 'utf8');
  assert.match(removeFinal, /status: 'inactive'/);
  assert.match(removeFinal, /finalTasksCancelled/);
  assert.match(removeFinal, /健康顾问生成随访计划后自动结束/);
  assert.match(fs.readFileSync(path.join(__dirname, '../../scripts/deploy.py'), 'utf8'), /removeOutpatientFinalAcceptanceV17/);
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
  for (const text of ['需要开具', '需向专家沟通', '专家诊疗意见及医嘱', '本次代诊实际开具的检验检查单/项目', '包括原计划项目和临时新增项目', '检验检查项目', '执行科室', '楼栋、楼层或具体地点', 'department', 'location', '检查日总体安排', '检查后专家门诊', '所有检查应安排在检查日', '检查应安排在检查后专家门诊之前']) assert.match(`${proxy}\n${route}`, new RegExp(text));
});

test('首次代诊完成后直接解锁已指定陪诊专员的任务', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '../src/scripts/migrateOutpatientProxyEscortHandoffV13.js'), 'utf8');
  const deploy = fs.readFileSync(path.join(__dirname, '../../scripts/deploy.py'), 'utf8');
  for (const text of ['dependsOnTaskId: followUp._id', "status: { $in: ['planned', 'in_progress'] }", 'formData.escortStaffId', '检查及专家门诊陪诊与归档', 'assignedTo: escortStaffId', 'isBlocked: false']) assert.match(`${route}\n${migration}`, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(deploy, /migrateOutpatientProxyEscortHandoffV13/);
  assert.match(deploy, /migrateOutpatientEscortHandoffDataV14/);
  const handoffMigration = fs.readFileSync(path.join(__dirname, '../src/scripts/migrateOutpatientEscortHandoffDataV14.js'), 'utf8');
  assert.match(handoffMigration, /handoffSnapshot: proxyVisit\.formData/);
});

test('陪诊完成后资料进入报告审核并由健康顾问生成随访计划闭环', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const escort = fs.readFileSync(path.join(__dirname, '../../staff/src/components/OutpatientEscortVisitForm.jsx'), 'utf8');
  const advisor = fs.readFileSync(path.join(__dirname, '../../staff/src/components/OutpatientPostVisitReviewForm.jsx'), 'utf8');
  const tasksPanel = fs.readFileSync(path.join(__dirname, '../../staff/src/components/ServiceTasksPanel.jsx'), 'utf8');
  for (const text of ['陪诊日安排', '检验检查过程', '特殊情况记录', '专家看诊情况、诊疗意见及医嘱', '已打印当日检验检查单', '已要求医生打印当日门诊病历', 'examOrderFiles', 'medicalRecordFiles']) assert.match(escort, new RegExp(text));
  assert.match(escort, /timeline[\s\S]*\.sort/);
  assert.match(route, /previewUrl: signStoredUrl/);
  for (const text of ['prescription_order', 'outpatient_record', "audit_status: 'unaudited'", "aiStatus: 'pending'", 'outpatient_reports_audited', 'system:outpatient_post_visit_review', '门诊一站式服务后续随访', "status: 'completed'", 'workflowCompletedAt']) assert.match(route, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(route, /任务绑定的两份正式资料为准[\s\S]*allRequiredReportsAudited/);
  assert.match(route, /历史任务未保存 reportIds[\s\S]*prescription_order[\s\S]*outpatient_record/);
  assert.match(route, /outpatient-ai-draft[\s\S]*仅健康顾问可生成并审核随访草稿/);
  assert.match(route, /只能依据下列已审核资料和陪诊记录生成草稿/);
  for (const text of ['资料查看结论', '后续随访内容', '首次随访日期']) assert.match(advisor, new RegExp(text));
  assert.match(tasksPanel, /陪诊及资料闭环进行中/);
  assert.match(tasksPanel, /等待资料审核/);
  assert.match(tasksPanel, /等待健管专员审核病历与检验检查单/);
  assert.match(tasksPanel, /system:outpatient_report_audit/);
  assert.match(route, /workflowKey: 'system:outpatient_report_audit'/);
  assert.match(route, /审核门诊一站式病历与检验检查单/);
  assert.match(route, /reportAuditTask[\s\S]*status: 'completed'/);
  const auditMigration = fs.readFileSync(path.join(__dirname, '../src/scripts/migrateOutpatientReportAuditTaskV18.js'), 'utf8');
  assert.match(auditMigration, /assignedHealthManager/);
  assert.match(auditMigration, /system:outpatient_report_audit/);
  assert.match(route, /sourceHealthPlanId\?\.status === 'completed'/);
  assert.match(route, /task\.dependsOnTaskId\?\.status === 'completed'/);
  const finalMigration = fs.readFileSync(path.join(__dirname, '../src/scripts/migrateOutpatientFinalCompletionV15.js'), 'utf8');
  assert.match(finalMigration, /system:outpatient_post_visit_review/);
  assert.match(finalMigration, /supervisorTasksCompleted/);
  assert.match(fs.readFileSync(path.join(__dirname, '../../scripts/deploy.py'), 'utf8'), /migrateOutpatientFinalCompletionV15/);
  assert.match(fs.readFileSync(path.join(__dirname, '../../scripts/deploy.py'), 'utf8'), /migrateOutpatientStaleSupervisorsV16/);
  assert.match(fs.readFileSync(path.join(__dirname, '../../scripts/deploy.py'), 'utf8'), /migrateOutpatientReportAuditTaskV18/);
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
