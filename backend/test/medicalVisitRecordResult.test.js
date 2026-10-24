const test = require('node:test');
const assert = require('node:assert/strict');
const { taskResult, summarizeMedicalVisitTasks } = require('../src/utils/medicalVisitRecordResult');

test('carries structured proxy visit, escort and itemized agency results into the visit record', () => {
  const tasks = [
    { status: 'completed', taskRole: 'executor', theme: '首次代诊开检查单', completedAt: '2026-10-20', executedContent: '代诊已完成', formData: { proxyVisitResult: '专家建议复查', examOrderSummary: '血常规', checkAppointments: [{ item: '血常规', department: '检验科', appointmentDate: '2026-10-21', appointmentTime: '09:00' }] } },
    { status: 'completed', taskRole: 'executor', theme: '检查及专家门诊陪诊', completedAt: '2026-10-21', formData: { inspectionProcess: '完成检查', specialSituations: '无', expertVisitSummary: '两周后复诊' } },
    { status: 'completed', taskRole: 'executor', theme: '代办资料', completedAt: '2026-10-22', serviceChecklist: [{ purpose: '领取病历', executionStatus: 'partial', executionResult: '已领取门诊病历', nextAction: '下周领取影像' }] },
  ];
  const result = summarizeMedicalVisitTasks(tasks);
  assert.match(result, /专家建议复查/);
  assert.match(result, /血常规/);
  assert.match(result, /完成检查/);
  assert.match(result, /两周后复诊/);
  assert.match(result, /领取病历：部分完成；结果：已领取门诊病历；下一步：下周领取影像/);
  assert.ok(result.indexOf('首次代诊') < result.indexOf('检查及专家门诊'));
});

test('does not bring uncompleted or supervisory work into the visit result', () => {
  const tasks = [
    { status: 'in_progress', taskRole: 'executor', theme: '代办', executedContent: '未完成内容' },
    { status: 'completed', taskRole: 'supervisor', theme: '代办核验', executedContent: '督办意见' },
    { status: 'completed', taskRole: 'executor', theme: '预约', executedContent: '预约已完成' },
  ];
  assert.equal(summarizeMedicalVisitTasks(tasks), '');
  assert.equal(taskResult({ theme: '就医专员代诊', executedContent: '历史执行文本' }), '历史执行文本');
});
