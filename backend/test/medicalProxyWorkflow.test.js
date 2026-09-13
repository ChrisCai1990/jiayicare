const test = require('node:test');
const assert = require('node:assert/strict');
const Admin = require('../src/models/Admin');
const MedicalReport = require('../src/models/MedicalReport');
const User = require('../src/models/User');
const { stageOf, validateMedicalProxyStage } = require('../src/utils/medicalProxyWorkflow');

test('medical proxy intake waits for audited patient documents before advisor handoff', async () => {
  const originalCount = MedicalReport.countDocuments;
  const originalFind = User.findById;
  try {
    MedicalReport.countDocuments = async filter => {
      assert.equal(filter.user, 'patient-1');
      assert.equal(filter.audit_status, 'audited');
      return 0;
    };
    User.findById = () => ({ select: () => ({ lean: async () => ({ assignedFamilyDoctor: 'doctor-1' }) }) });
    const task = { sourceType: 'order', workflowKey: 'medical_proxy:intake', patientId: 'patient-1', assignedTo: 'manager-1' };
    assert.equal(stageOf(task), 'intake');
    const body = { status: 'completed', formData: { customerNeed: '代诊诉求', materialSummary: '已核对资料', reportIds: ['report-1'] } };
    assert.match(await validateMedicalProxyStage(task, body, { _id: 'manager-1', role: 'healthManager' }), /审核通过/);
    MedicalReport.countDocuments = async () => 1;
    assert.equal(await validateMedicalProxyStage(task, body, { _id: 'manager-1', role: 'healthManager' }), '');
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
    const data = { intakeSnapshot: { reportIds: ['report-1'] }, hospital: '医院', department: '科室', expert: '专家', proxyGoal: '取得专业意见' };
    assert.match(await validateMedicalProxyStage(advisor, { status: 'completed', formData: data }, { _id: 'doctor-1', role: 'familyDoctor' }), /交流内容/);
    data.communicationContent = '向专家确认复查安排';
    assert.equal(await validateMedicalProxyStage(advisor, { status: 'completed', formData: data }, { _id: 'doctor-1', role: 'familyDoctor' }), '');
    const planner = { sourceType: 'order', workflowKey: 'medical_proxy:planner', assignedTo: 'planner-1' };
    assert.match(await validateMedicalProxyStage(planner, { status: 'completed', formData: {} }, { _id: 'planner-1', role: 'healthPlanner' }), /就医专员/);
    assert.equal(await validateMedicalProxyStage(planner, { status: 'completed', formData: { medicalAssistantId: 'assistant-1' } }, { _id: 'planner-1', role: 'healthPlanner' }), '');
  } finally {
    MedicalReport.countDocuments = originalCount;
    User.findById = originalFind;
    Admin.findOne = originalAdminFind;
  }
});
