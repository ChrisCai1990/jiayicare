const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Admin = require('../src/models/Admin');
const FollowUp = require('../src/models/FollowUp');
const MedicalReport = require('../src/models/MedicalReport');
const User = require('../src/models/User');
const Order = require('../src/models/Order');
const { isMedicalProxyOrder, stageOf, preparationDueDate, reportIdsFromTask, extractMedicalProxyRechecks, validateMedicalProxyStage } = require('../src/utils/medicalProxyWorkflow');

test('storefront and staff orders resolve to the same proxy workflow', () => {
  assert.equal(isMedicalProxyOrder({ serviceName: '医疗代诊服务', serviceWorkflowSnapshot: { key: 'medical_proxy' } }), true);
  assert.equal(isMedicalProxyOrder({ serviceName: '专科咨询', serviceWorkflowSnapshot: { key: 'medical_proxy' } }), true);
  assert.equal(isMedicalProxyOrder({ serviceName: '医疗代诊服务' }), true);
  assert.equal(isMedicalProxyOrder({ serviceName: '专家约诊服务', serviceWorkflowSnapshot: { key: 'medical_assist' } }), true);
  assert.equal(isMedicalProxyOrder({ serviceName: '就医规划服务', serviceWorkflowSnapshot: { key: 'medical_assist' } }), true);
  assert.equal(isMedicalProxyOrder({ serviceName: '门诊一站式服务', serviceWorkflowSnapshot: { key: 'medical_assist' } }), false);
});

test('service record upsert does not update result through conflicting operators', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  assert.doesNotMatch(workflow, /\$setOnInsert:\s*\{[^}]*result:/);
});

test('collection is due three days before proxy visit or immediately inside the window', () => {
  assert.equal(preparationDueDate(new Date('2026-09-20T00:00:00+08:00'), new Date('2026-09-14T00:00:00+08:00')).toISOString(), new Date('2026-09-17T00:00:00+08:00').toISOString());
  assert.equal(preparationDueDate(new Date('2026-09-16T00:00:00+08:00'), new Date('2026-09-14T11:00:00+08:00')).toISOString(), new Date('2026-09-14T11:00:00+08:00').toISOString());
});

test('carries the explicit report selection from a prior service task', () => {
  assert.deepEqual(reportIdsFromTask({
    formData: { selectedReportIds: ['report-1'], reportIds: ['report-1', 'report-2'] },
    serviceChecklist: [{ reportIds: ['report-2', 'report-3'] }],
  }), ['report-1', 'report-2', 'report-3']);
});

test('extracts calendar follow-up suggestions from proxy visit feedback', () => {
  const [suggestion] = extractMedicalProxyRechecks('暂时不需要治疗，减少饮酒，1年后复查胃肠镜', new Date('2026-09-18T08:30:00+08:00'));
  assert.equal(suggestion.action, '复查胃肠镜');
  assert.equal(suggestion.due.toISOString(), new Date('2027-09-18T08:30:00+08:00').toISOString());
});

test('execution requires a result and an uploaded medical record', async () => {
  const task = { sourceType: 'order', workflowKey: 'medical_proxy:execute', assignedTo: 'assistant-1' };
  assert.match(await validateMedicalProxyStage(task, { status: 'completed', formData: { executionResult: '一年后复查' } }, { _id: 'assistant-1', role: 'medicalAssistant' }), /上传/);
  assert.equal(await validateMedicalProxyStage(task, { status: 'completed', formData: { executionResult: '一年后复查', medicalRecordAttachments: [{ url: '/uploads/record.pdf' }] } }, { _id: 'assistant-1', role: 'medicalAssistant' }), '');
});

test('planner selects patient documents, then manager audit gates advisor handoff', async () => {
  const originalCount = MedicalReport.countDocuments;
  const originalFind = User.findById;
  try {
    MedicalReport.countDocuments = async filter => {
      assert.equal(filter.user, 'patient-1');
      assert.equal(filter.audit_status, undefined);
      return 0;
    };
    User.findById = () => ({ select: () => ({ lean: async () => ({ assignedHealthManager: 'manager-1', assignedFamilyDoctor: 'doctor-1' }) }) });
    const task = { sourceType: 'order', workflowKey: 'medical_proxy:collect', patientId: 'patient-1', assignedTo: 'planner-1' };
    assert.equal(stageOf(task), 'collect');
    const body = { status: 'completed', formData: { customerNeed: '代诊诉求', communicationDate: '2026-09-18', communicationTimeStart: '14:00', communicationTimeEnd: '16:00', materialSummary: '已核对资料', reportIds: ['report-1'] } };
    assert.match(await validateMedicalProxyStage(task, body, { _id: 'planner-1', role: 'healthPlanner' }), /属于该客户/);
    MedicalReport.countDocuments = async () => 1;
    assert.equal(await validateMedicalProxyStage(task, body, { _id: 'planner-1', role: 'healthPlanner' }), '');
    const audit = { sourceType: 'order', workflowKey: 'medical_proxy:audit', patientId: 'patient-1', assignedTo: 'manager-1' };
    const auditBody = { status: 'completed', formData: { collectionSnapshot: body.formData, auditSummary: '资料齐全' } };
    MedicalReport.countDocuments = async () => 0;
    assert.match(await validateMedicalProxyStage(audit, auditBody, { _id: 'manager-1', role: 'healthManager' }), /审核/);
    MedicalReport.countDocuments = async () => 1;
    assert.equal(await validateMedicalProxyStage(audit, auditBody, { _id: 'manager-1', role: 'healthManager' }), '');
  } finally {
    MedicalReport.countDocuments = originalCount;
    User.findById = originalFind;
  }
});

test('advisor must confirm five proxy visit fields and planner must assign active medical assistant', async () => {
  const originalCount = MedicalReport.countDocuments;
  const originalFind = User.findById;
  const originalAdminFind = Admin.findOne;
  try {
    MedicalReport.countDocuments = async () => 1;
    User.findById = () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner: 'planner-1', assignedHealthManager: 'manager-1' }) }) });
    Admin.findOne = () => ({ select: () => ({ lean: async () => ({ _id: 'assistant-1' }) }) });
    const advisor = { sourceType: 'order', workflowKey: 'medical_proxy:advisor', patientId: 'patient-1', assignedTo: 'doctor-1' };
    const data = { auditSnapshot: { collectionSnapshot: { reportIds: ['report-1'], annualMember: true } }, hospital: '医院', department: '科室', expert: '专家', proxyGoal: '取得专业意见' };
    assert.match(await validateMedicalProxyStage(advisor, { status: 'completed', formData: data }, { _id: 'doctor-1', role: 'familyDoctor' }), /交流内容/);
    data.communicationContent = '向专家确认复查安排';
    assert.match(await validateMedicalProxyStage(advisor, { status: 'completed', formData: data }, { _id: 'doctor-1', role: 'familyDoctor' }), /年度会员/);
    data.selectedReportIds = ['report-1'];
    assert.equal(await validateMedicalProxyStage(advisor, { status: 'completed', formData: data }, { _id: 'doctor-1', role: 'familyDoctor' }), '');
    assert.match(await validateMedicalProxyStage({ sourceType: 'order', workflowKey: 'medical_proxy:supervise' }, { status: 'completed' }, { role: 'healthPlanner' }), /自动结束/);
    const planner = { sourceType: 'order', workflowKey: 'medical_proxy:planner', assignedTo: 'planner-1' };
    assert.match(await validateMedicalProxyStage(planner, { status: 'completed', formData: {} }, { _id: 'planner-1', role: 'healthPlanner' }), /就医专员/);
    assert.equal(await validateMedicalProxyStage(planner, { status: 'completed', formData: { medicalAssistantId: 'assistant-1' } }, { _id: 'planner-1', role: 'healthPlanner' }), '');
    const booking = { sourceType: 'order', workflowKey: 'medical_proxy:booking', assignedTo: 'manager-1' };
    const bookingData = { medicalAssistantId: 'assistant-1', preferredDateStart: '2026-09-16', preferredDateEnd: '2026-09-18', appointmentDate: '2026-09-19', appointmentTime: '09:30' };
    assert.match(await validateMedicalProxyStage(booking, { status: 'completed', formData: bookingData }, { _id: 'manager-1', role: 'healthManager' }), /期望区间/);
    bookingData.dateDifferenceNote = '客户已确认改为专家出诊日';
    assert.equal(await validateMedicalProxyStage(booking, { status: 'completed', formData: bookingData }, { _id: 'manager-1', role: 'healthManager' }), '');
  } finally {
    MedicalReport.countDocuments = originalCount;
    User.findById = originalFind;
    Admin.findOne = originalAdminFind;
  }
});

test('advisor can continue an audited intake task created before workflow redesign', async () => {
  const originalCount = MedicalReport.countDocuments;
  const originalFind = User.findById;
  try {
    MedicalReport.countDocuments = async filter => {
      assert.equal(filter.audit_status, 'audited');
      return 1;
    };
    User.findById = () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner: 'planner-1' }) }) });
    const task = { sourceType: 'order', workflowKey: 'medical_proxy:advisor', patientId: 'patient-1', assignedTo: 'doctor-1' };
    const formData = { intakeSnapshot: { reportIds: ['report-1'] }, hospital: '医院', department: '科室', expert: '专家', proxyGoal: '目标', communicationContent: '交流内容' };
    assert.equal(await validateMedicalProxyStage(task, { status: 'completed', formData }, { _id: 'doctor-1', role: 'familyDoctor' }), '');
  } finally {
    MedicalReport.countDocuments = originalCount;
    User.findById = originalFind;
  }
});

test('workflow keeps booking between planner and execution and shows the complete handoff', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  const form = fs.readFileSync(path.join(__dirname, '../../staff/src/components/MedicalProxyStageForm.jsx'), 'utf8');
  assert.match(workflow, /\['collect', 'audit', 'advisor', 'planner', 'booking', 'execute'\]/);
  for (const text of ['客户期望日期（开始）', '客户期望日期（结束）', '专家实际出诊及约诊日期', '超出期望区间说明及客户确认情况', '代诊医院', '与医生交流内容', '预约补充说明']) {
    assert.match(form, new RegExp(text));
  }
  assert.doesNotMatch(form, /预约结果、预约凭证及就诊注意事项/);
  assert.match(form, /上传代诊病历/);
  assert.match(form, /!isExpertAppointment/);
});

test('medical planning confirmation creates a direct advisor handoff without marking reports audited', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  assert.match(workflow, /if \(medicalPlanning\) \{[\s\S]*workflowKey: `\$\{PREFIX\}advisor`/);
  assert.match(workflow, /assignedTo: patient\.assignedFamilyDoctor/);
  assert.match(workflow, /medicalPlanning: true, serviceContent, customerNeed, communicationDate, communicationTimeStart, communicationTimeEnd/);
  assert.match(workflow, /reportIds: \[\]/);
});

test('planning advisor can complete an assessment without proxy-visit booking fields', async () => {
  const task = { sourceType: 'order', workflowKey: 'medical_proxy:advisor', patientId: 'patient-1', assignedTo: 'doctor-1' };
  const originalFind = User.findById;
  try {
    User.findById = () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner: 'planner-1' }) }) });
    const formData = { medicalPlanning: true, customerNeed: '需要解读报告并确定就医方向', problemAnalysis: '需要结合报告评估', hospitalRecommendations: '某医院', departmentRecommendations: '某科室', expertRecommendation1: '专家甲', expertRecommendation2: '专家乙' };
    assert.equal(await validateMedicalProxyStage(task, { status: 'completed', formData }, { _id: 'doctor-1', role: 'familyDoctor' }), '');
    delete formData.expertRecommendation2;
    assert.match(await validateMedicalProxyStage(task, { status: 'completed', formData }, { _id: 'doctor-1', role: 'familyDoctor' }), /至少推荐两位专家/);
  } finally { User.findById = originalFind; }
});

test('planning supervisor remains open until advisor completes and planner records customer decision', async () => {
  const originalOrderFind = Order.findById;
  const originalFollowUpFind = FollowUp.findOne;
  try {
    Order.findById = () => ({ select: () => ({ lean: async () => ({ serviceName: '就医规划服务' }) }) });
    let advisorCompleted = false;
    FollowUp.findOne = () => ({ select: () => ({ lean: async () => advisorCompleted ? { _id: 'advisor-1' } : null }) });
    const task = { sourceType: 'order', sourceOrderId: 'order-1', workflowKey: 'medical_proxy:supervise', assignedTo: 'planner-1', formData: { medicalPlanning: true } };
    const body = { status: 'completed', formData: { medicalPlanning: true, customerCommunicationSummary: '客户已确认建议', planningOutcome: 'no_additional_service' } };
    const staff = { _id: 'planner-1', role: 'healthPlanner' };
    assert.match(await validateMedicalProxyStage(task, body, staff), /等待健康顾问/);
    advisorCompleted = true;
    assert.equal(await validateMedicalProxyStage(task, body, staff), '');
    delete body.formData.planningOutcome;
    assert.match(await validateMedicalProxyStage(task, body, staff), /确认是否需要/);
  } finally { Order.findById = originalOrderFind; FollowUp.findOne = originalFollowUpFind; }
});

test('advisor handoff reactivates planning supervision instead of auto-closing it', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  const planningHandoff = workflow.split("if (task.formData?.medicalPlanning === true) {")[1].split('\n      return;')[0];
  assert.match(planningHandoff, /planner_followup/);
  assert.match(planningHandoff, /advisorSnapshot/);
  assert.doesNotMatch(planningHandoff, /status: 'completed'/);
});

test('annual-member staff initiation skips collection, audit and planner execution stages', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  assert.match(workflow, /stage === 'advisor'.*STAFF_DIRECT_SOURCE \? 'booking'/);
  assert.match(workflow, /健康规划师全程督办/);
  assert.doesNotMatch(workflow, /仅适用于年度会员/);
});

test('booking and execution write the shared hospital visit service archive', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  const model = fs.readFileSync(path.join(__dirname, '../src/models/ServiceRecord.js'), 'utf8');
  assert.match(workflow, /upsertMedicalProxyServiceRecord\(task, order, false\)/);
  assert.match(workflow, /upsertMedicalProxyServiceRecord\(task, order, true\)/);
  assert.match(workflow, /type: 'medical_visit'/);
  assert.match(model, /sourceOrderId:/);
});

test('expert appointment booking completes without a medical assistant', async () => {
  const originalOrderFind = Order.findById;
  const originalAdminFind = Admin.findOne;
  try {
    Order.findById = () => ({ select: () => ({ lean: async () => ({ serviceName: '专家约诊服务' }) }) });
    Admin.findOne = () => { throw new Error('expert appointment must not validate a medical assistant'); };
    const task = { sourceType: 'order', sourceOrderId: 'order-1', workflowKey: 'medical_proxy:booking', assignedTo: 'manager-1' };
    const formData = { preferredDateStart: '2026-09-16', preferredDateEnd: '2026-09-18', appointmentDate: '2026-09-17', appointmentTime: '10:00' };
    assert.equal(await validateMedicalProxyStage(task, { status: 'completed', formData }, { _id: 'manager-1', role: 'healthManager' }), '');
  } finally {
    Order.findById = originalOrderFind;
    Admin.findOne = originalAdminFind;
  }
});

test('expert appointment closes the order and supports advisor to manager initiation', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '../src/scripts/migrateExpertAppointmentWorkflowV12.js'), 'utf8');
  assert.match(workflow, /appointmentOnly[\s\S]*assignedHealthManager/);
  assert.match(workflow, /serviceName = appointmentOnly \? '专家约诊服务'/);
  assert.match(workflow, /order\.status = 'completed';[\s\S]*order\.tradeStatus = 'completed'/);
  assert.match(migration, /assistanceType: 'expert_appointment'/);
});
