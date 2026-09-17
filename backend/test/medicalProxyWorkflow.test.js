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
  assert.match(await validateMedicalProxyStage(task, { status: 'completed', formData: { executionOutcome: 'success', executionResult: '一年后复查' } }, { _id: 'assistant-1', role: 'medicalAssistant' }), /上传/);
  assert.equal(await validateMedicalProxyStage(task, { status: 'completed', formData: { executionOutcome: 'success', executionResult: '一年后复查', medicalRecordAttachments: [{ url: '/uploads/record.pdf' }] } }, { _id: 'assistant-1', role: 'medicalAssistant' }), '');
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
  assert.match(workflow, /const STAGES = \['collect', 'audit', 'advisor', 'planner', 'booking', 'execute'\]/);
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
    const formData = { medicalPlanning: true, customerNeed: '需要解读报告并确定就医方向', problemAnalysis: '需要结合报告评估', expertRecommendation1: '专家甲，某医院某科室', expertRecommendation2: '专家乙，另一医院某科室' };
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

test('staff-initiated medication booking hands off to the health planner for assignment', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PatientDetailPage.jsx'), 'utf8');
  assert.match(workflow, /supplyProxy && stage === 'booking' \? 'planner'/);
  assert.match(workflow, /nextTask\.isBlocked \|\| nextTask\.status === 'cancelled'/);
  assert.match(workflow, /next === 'planner' \? patient\?\.assignedHealthPlanner/);
  assert.match(page, /确认预约并转健康规划师分配/);
  assert.match(page, /代配药门诊预约已完成，转健康规划师安排执行人员/);
});

test('medication proxy execution requires all four delivery documents', async () => {
  const originalFindById = Order.findById;
  try {
    Order.findById = () => ({ select: () => ({ lean: async () => ({ serviceName: '代配药服务' }) }) });
    const task = { sourceType: 'order', sourceOrderId: 'order-1', workflowKey: 'medical_proxy:execute', assignedTo: 'assistant-1' };
    const base = { executionOutcome: 'success', executionResult: '已按清单配药并核对数量', medicationPhotoAttachments: [{ url: '/uploads/medicine.jpg' }], medicationInstructionAttachments: [{ url: '/uploads/instructions.pdf' }], medicalRecordAttachments: [{ url: '/uploads/record.pdf' }] };
    assert.match(await validateMedicalProxyStage(task, { status: 'completed', formData: base }, { _id: 'assistant-1', role: 'medicalAssistant' }), /收费单/);
    assert.equal(await validateMedicalProxyStage(task, { status: 'completed', formData: { ...base, chargeReceiptAttachments: [{ url: '/uploads/receipt.jpg' }] } }, { _id: 'assistant-1', role: 'medicalAssistant' }), '');
  } finally {
    Order.findById = originalFindById;
  }
});

test('failed medication proxy execution allows completion without delivery documents', async () => {
  const originalFindById = Order.findById;
  try {
    Order.findById = () => ({ select: () => ({ lean: async () => ({ serviceName: '代配药服务' }) }) });
    const task = { sourceType: 'order', sourceOrderId: 'order-1', workflowKey: 'medical_proxy:execute', assignedTo: 'assistant-1' };
    const formData = { executionOutcome: 'failed', executionResult: '普通门诊无法开具进口药，已建议客户改由互联网医院配药' };
    assert.equal(await validateMedicalProxyStage(task, { status: 'completed', formData }, { _id: 'assistant-1', role: 'medicalAssistant' }), '');
  } finally {
    Order.findById = originalFindById;
  }
});

test('failed medication proxy execution returns to manager and keeps planner supervision active', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  const panel = fs.readFileSync(path.join(__dirname, '../../staff/src/components/ServiceTasksPanel.jsx'), 'utf8');
  const failureBranch = workflow.split("task.formData?.executionOutcome === 'failed'")[1].split("if (stage === 'execute' && task.formData?.medicalEscort")[0];
  assert.match(failureBranch, /workflowKey: `\$\{PREFIX\}booking`/);
  assert.match(failureBranch, /assignedTo: patient\?\.assignedHealthManager/);
  assert.match(failureBranch, /status: 'planned'/);
  assert.match(failureBranch, /workflowKey: `\$\{PREFIX\}supervise`/);
  assert.match(failureBranch, /executionFailed': true/);
  assert.match(failureBranch, /supervisionStatus: 'in_progress'/);
  assert.match(workflow, /retryCompletedExecution/);
  assert.match(panel, /代配未成功，健管专员重新处理/);
});

test('staff-initiated medication keeps a planner supervision task until execution completes', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PatientDetailPage.jsx'), 'utf8');
  const directStart = workflow.split('async function startStaffMedicalProxyWorkflow')[1].split('async function validateMedicalProxyStage')[0];
  assert.match(directStart, /健康规划师全程督办/);
  assert.match(directStart, /workflowKey: `\$\{PREFIX\}supervise`/);
  assert.match(directStart, /taskRole: 'supervisor'/);
  assert.match(directStart, /status: 'in_progress'/);
  assert.match(directStart, /date: initialTaskDate, remindAt: initialTaskDate/);
  assert.match(directStart, /supervisorId: patient\.assignedHealthPlanner/);
  assert.match(workflow, /supplyProxy \? `执行人员已完成/);
  assert.match(page, /健康规划师分配配药执行人员/);
  assert.match(page, /执行人员配药确认与配送/);
});

test('service-plan medication uses supply-entry fields and blocks duplicate active orders', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const plansPage = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PlansPage.jsx'), 'utf8');
  assert.match(routes, /institutionType: intake\.institutionType \|\| supply\.institutionType/);
  assert.match(routes, /同一药品和服务日期已有未完成的代配药服务/);
  assert.match(routes, /'medicalProxyPlan\.preferredDateStart': req\.body\.preferredDateStart/);
  assert.match(plansPage, /配备与交付信息/);
  assert.match(plansPage, /institutionType: form\.institutionType/);
  assert.match(plansPage, /paymentMethod: form\.paymentMethod/);
  assert.match(plansPage, /expectedDeliveryDate: isMedicationProxy \? form\.serviceDate/);
});

test('medical escort skips booking and sends manager review only after execution', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  const panel = fs.readFileSync(path.join(__dirname, '../../staff/src/components/ServiceTasksPanel.jsx'), 'utf8');
  const stageForm = fs.readFileSync(path.join(__dirname, '../../staff/src/components/MedicalProxyStageForm.jsx'), 'utf8');
  const patientPage = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PatientDetailPage.jsx'), 'utf8');
  const plansPage = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PlansPage.jsx'), 'utf8');
  const directStart = workflow.split('async function startStaffMedicalProxyWorkflow')[1].split('async function validateMedicalProxyStage')[0];
  assert.match(directStart, /theme: `就医陪同：健康规划师全程督办/);
  assert.match(directStart, /supervisorId: patient\.assignedHealthPlanner/);
  assert.match(directStart, /if \(directlyAssigned\)/);
  assert.match(directStart, /workflowKey: `\$\{PREFIX\}execute`/);
  assert.match(directStart, /assignedTo: plan\.medicalAssistantId/);
  assert.match(workflow, /medicalEscort === true && stage === 'planner' \? 'execute'/);
  assert.match(workflow, /stage === 'execute' && task\.formData\?\.medicalEscort === true[\s\S]*post_visit_audit/);
  assert.match(workflow, /const reportIds = await archiveMedicalProxyRecords/);
  assert.match(workflow, /status: 'planned', isBlocked: false[\s\S]*executionSnapshot/);
  assert.match(workflow, /MedicalReport\.deleteMany/);
  assert.match(workflow, /async function repairCompletedMedicalEscortAuditTasks/);
  assert.match(workflow, /workflowKey: `\$\{PREFIX\}execute`[\s\S]*status: 'completed'/);
  assert.match(workflow, /'formData\.executionSnapshot': executionSnapshot/);
  assert.match(workflow, /currentStage: 'post_visit_audit'/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8'), /repairCompletedMedicalEscortAuditTasks\(req\.staff\._id\)/);
  assert.match(directStart, /assignmentMode: 'automatic'/);
  assert.match(panel, /const medicalEscortProgress/);
  assert.match(panel, /medicationProxyProgress\(task\) \|\| medicalEscortProgress\(task\)/);
  assert.match(panel, /progress\?\.steps/);
  assert.match(panel, /\['人员分配', '陪同执行', '资料审核', '完成'\]/);
  assert.match(stageForm, /健康顾问提交的陪同服务信息/);
  assert.match(stageForm, /陪同执行结果、现场情况和后续事项/);
  assert.match(stageForm, /陪同资料附件（报告、病历等）/);
  assert.match(stageForm, /就医专员本次提交内容/);
  assert.match(stageForm, /submittedReportIds\.has/);
  assert.match(patientPage, /陪同就医 · 执行记录/);
  assert.match(patientPage, /完成陪同并提交资料审核/);
  assert.match(plansPage, /if \(isMedicalEscort\)[\s\S]*startStaffMedicalProxy\(patientId/);
  assert.match(plansPage, /!isMedicalEscort[\s\S]*督办人/);
  assert.match(plansPage, /不生成就医协助方案/);
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

test('high-end insurance booking requires a verified settlement outcome', async () => {
  const originalOrderFind = Order.findById;
  try {
    Order.findById = () => ({ select: () => ({ lean: async () => ({ serviceName: '专家约诊服务' }) }) });
    const task = { sourceType: 'order', sourceOrderId: 'order-1', workflowKey: 'medical_proxy:booking', assignedTo: 'manager-1' };
    const formData = { planSnapshot: { serviceContent: '门诊类型：国际门诊；费用与保险：使用高端医疗险' }, preferredDateStart: '2026-09-16', preferredDateEnd: '2026-09-18', appointmentDate: '2026-09-17', appointmentTime: '10:00' };
    assert.match(await validateMedicalProxyStage(task, { status: 'completed', formData }, { _id: 'manager-1', role: 'healthManager' }), /核实高端医疗险/);
    formData.insuranceOutcome = 'direct_verified';
    assert.equal(await validateMedicalProxyStage(task, { status: 'completed', formData }, { _id: 'manager-1', role: 'healthManager' }), '');
  } finally {
    Order.findById = originalOrderFind;
  }
});

test('medication booking requires the medical insurance credential type', async () => {
  const originalOrderFind = Order.findById;
  try {
    Order.findById = () => ({ select: () => ({ lean: async () => ({ serviceName: '代配药服务' }) }) });
    const task = { sourceType: 'order', sourceOrderId: 'order-1', workflowKey: 'medical_proxy:booking', assignedTo: 'manager-1' };
    const formData = { medicationProxy: true, medicationName: '盐酸舍曲林', medicationBrand: '左洛复', medicationSpecification: '50mg×14片', medicationQuantity: '2盒', paymentMethod: 'medical_insurance', preferredDateStart: '2026-09-16', preferredDateEnd: '2026-09-18', appointmentDate: '2026-09-17', appointmentTime: '10:00' };
    assert.match(await validateMedicalProxyStage(task, { status: 'completed', formData }, { _id: 'manager-1', role: 'healthManager' }), /电子医保卡.*实体医保卡/);
    formData.medicalInsuranceCardType = 'electronic';
    assert.equal(await validateMedicalProxyStage(task, { status: 'completed', formData }, { _id: 'manager-1', role: 'healthManager' }), '');
  } finally {
    Order.findById = originalOrderFind;
  }
});

test('expert appointment stays open until post-visit reports are audited and reviewed', async () => {
  const originalOrderFind = Order.findById;
  const originalCount = MedicalReport.countDocuments;
  const task = { sourceType: 'order', sourceOrderId: 'order-1', patientId: 'patient-1', assignedTo: 'manager-1', workflowKey: 'medical_proxy:post_visit_audit' };
  const formData = { reportIds: ['report-1'], auditSummary: '病历及检查报告已审核' };
  try {
    Order.findById = () => ({ select: () => ({ lean: async () => ({ scheduledAt: new Date('2026-09-10T06:00:00Z') }) }) });
    MedicalReport.countDocuments = async filter => {
      assert.equal(filter.user, 'patient-1');
      assert.equal(filter.audit_status, 'audited');
      assert.equal(filter.createdAt.$gte.toISOString(), '2026-09-10T06:00:00.000Z');
      return 0;
    };
    assert.match(await validateMedicalProxyStage(task, { status: 'completed', formData }, { _id: 'manager-1', role: 'healthManager' }), /就诊后上传且已由健管专员审核/);
    MedicalReport.countDocuments = async () => 1;
    assert.equal(await validateMedicalProxyStage(task, { status: 'completed', formData }, { _id: 'manager-1', role: 'healthManager' }), '');
    assert.equal(await validateMedicalProxyStage(task, { status: 'completed', formData: { reportIds: [], noMaterialsConfirmed: true, auditSummary: '客户确认本次无资料' } }, { _id: 'manager-1', role: 'healthManager' }), '');
    task.workflowKey = 'medical_proxy:post_visit_review'; task.assignedTo = 'advisor-1';
    assert.match(await validateMedicalProxyStage(task, { status: 'completed', formData: {} }, { _id: 'advisor-1', role: 'familyDoctor' }), /查看结论/);
  } finally {
    Order.findById = originalOrderFind;
    MedicalReport.countDocuments = originalCount;
  }
});

test('expert appointment closes only after post-visit follow-up review and supports advisor initiation', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '../src/scripts/migrateExpertAppointmentWorkflowV12.js'), 'utf8');
  assert.match(workflow, /appointmentOnly[\s\S]*assignedHealthManager/);
  assert.match(workflow, /appointmentOnly \? '专家约诊服务'/);
  assert.match(workflow, /order\.status = 'completed';[\s\S]*order\.tradeStatus = 'completed'/);
  assert.match(migration, /assistanceType: 'expert_appointment'/);
});
