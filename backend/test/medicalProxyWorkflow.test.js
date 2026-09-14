const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Admin = require('../src/models/Admin');
const MedicalReport = require('../src/models/MedicalReport');
const User = require('../src/models/User');
const { stageOf, preparationDueDate, reportIdsFromTask, extractMedicalProxyRechecks, validateMedicalProxyStage } = require('../src/utils/medicalProxyWorkflow');

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
    const body = { status: 'completed', formData: { customerNeed: '代诊诉求', materialSummary: '已核对资料', reportIds: ['report-1'] } };
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
    const bookingData = { medicalAssistantId: 'assistant-1', customerPreferredDate: '2026-09-16', appointmentDate: '2026-09-17', appointmentTime: '09:30' };
    assert.match(await validateMedicalProxyStage(booking, { status: 'completed', formData: bookingData }, { _id: 'manager-1', role: 'healthManager' }), /日期不一致/);
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
  for (const text of ['客户期望日期', '专家实际出诊及约诊日期', '日期不一致说明及客户确认情况', '代诊医院', '与医生交流内容', '预约补充说明']) {
    assert.match(form, new RegExp(text));
  }
  assert.doesNotMatch(form, /预约结果、预约凭证及就诊注意事项/);
  assert.match(form, /上传代诊病历/);
});
