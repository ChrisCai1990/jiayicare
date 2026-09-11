const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TEMPLATE_NORMALIZATION } = require('../src/scripts/normalizeMedicalAssistTemplates');
const { PRODUCT_NAME, WORKFLOW_PLANS } = require('../src/scripts/migrateOutpatientOneStopWorkflowV5');

test('门诊一站式是完整多阶段服务，不是单次代办', () => {
  assert.equal(PRODUCT_NAME, '门诊一站式服务');
  assert.equal(WORKFLOW_PLANS.length, 6);
  const names = WORKFLOW_PLANS.map(item => item.name).join('\n');
  for (const expected of ['资料收集与核对', '健康顾问评估及医院专家确定', '首次代诊门诊预约', '首次代诊开检查单', '检查日专家号预约', '检查及专家门诊陪诊与归档']) assert.match(names, new RegExp(expected));
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
  assert.ok(WORKFLOW_PLANS.every(item => item.executorRole !== 'healthPlanner'));
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  assert.match(route, /supervisorRole \|\| 'healthPlanner'/);
  assert.match(route, /dependsOnTaskId: options\.dependsOnTaskId \|\| null/);
  assert.match(route, /activationEvent: executorBlocked \? 'previous_stage_approved'/);
  assert.match(route, /isOutpatientOneStop[\s\S]*status: 'completed'[\s\S]*dependsOnTaskId: supervisor\._id[\s\S]*isBlocked: false/);
  assert.match(route, /!c\.serviceDate && !isOutpatientOneStop/);
});

test('健康顾问环节使用结构化就医评估并由后端校验', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const form = fs.readFileSync(path.join(__dirname, '../../staff/src/components/OutpatientAdvisorAssessmentForm.jsx'), 'utf8');
  for (const field of ['recommendedHospital', 'recommendedDepartment', 'recommendedExpert', 'expectedChecks', 'expertRequired', 'expertName']) {
    assert.match(form, new RegExp(field));
    assert.match(route, new RegExp(field));
  }
  assert.match(form, /健管专员已收集资料/);
  assert.match(form, /完成评估并流转下一步|validateOutpatientAssessment/);
});

test('首次门诊预约展示顾问建议并保存实际预约安排', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const form = fs.readFileSync(path.join(__dirname, '../../staff/src/components/OutpatientAppointmentForm.jsx'), 'utf8');
  assert.match(route, /serviceChecklist formData executedContent/);
  assert.match(route, /formData: followUp\.formData \|\| null/);
  for (const text of ['健康顾问评估建议', '实际预约安排', 'appointmentDate', 'appointmentTime', '确认预约并流转代诊']) {
    assert.match(`${form}\n${fs.readFileSync(path.join(__dirname, '../../staff/src/pages/FollowUpsPage.jsx'), 'utf8')}`, new RegExp(text));
  }
});
