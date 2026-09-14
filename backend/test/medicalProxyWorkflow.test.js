const test = require('node:test');
const assert = require('node:assert/strict');
const Admin = require('../src/models/Admin');
const MedicalReport = require('../src/models/MedicalReport');
const User = require('../src/models/User');
const { stageOf, preparationDueDate, reportIdsFromTask, validateMedicalProxyStage } = require('../src/utils/medicalProxyWorkflow');

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
    User.findById = () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner: 'planner-1' }) }) });
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
