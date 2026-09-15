const test = require('node:test');
const assert = require('node:assert/strict');
const { isMedicalReminderOrder, normalizeIntake, validateIntake, stageOf } = require('../src/utils/medicalReminderWorkflow');

test('only starts the dedicated workflow for medical reminder products', () => {
  assert.equal(isMedicalReminderOrder('就医提醒服务'), true);
  assert.equal(isMedicalReminderOrder('复查督办服务'), true);
  assert.equal(isMedicalReminderOrder('门诊一站式服务'), false);
});

test('normalizes the six confirmed visit fields and reports missing data', () => {
  const data = normalizeIntake({ visitDate: ' 2026-10-01 ', medicalIssue: '复查血压', visitGoal: '调整方案', hospitalSuggestion: '市一医院', departmentSuggestion: '心内科', expertSuggestion: '王医生' });
  assert.deepEqual(data, { visitDate: '2026-10-01', medicalIssue: '复查血压', visitGoal: '调整方案', hospitalSuggestion: '市一医院', departmentSuggestion: '心内科', expertSuggestion: '王医生' });
  assert.equal(validateIntake(data), '');
  assert.match(validateIntake({ ...data, expertSuggestion: '' }), /完整确认/);
});

test('recognizes only medical reminder workflow stages', () => {
  assert.equal(stageOf({ workflowKey: 'medical_reminder:documents' }), 'documents');
  assert.equal(stageOf({ workflowKey: 'medical_proxy:intake' }), '');
});
