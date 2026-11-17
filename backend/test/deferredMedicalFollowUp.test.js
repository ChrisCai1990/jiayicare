const test = require('node:test');
const assert = require('node:assert/strict');
const { eligible, nextDate, successor } = require('../src/utils/deferredMedicalFollowUp');

test('已联系但本次未检查的旧任务可办结，并只生成一个关联原管理问题的新待办', () => {
  const old = { _id: 'old-task', patientId: 'patient', staffId: 'manager', assignedTo: 'manager',
    sourceType: 'scheduled', sourceScheduleKey: 'abnormal_followup:0:2026-11-15',
    sourceAnnualPlanId: 'annual-plan', managementIssueIds: ['management_issue:1'],
    theme: '异常复查提醒', plannedContent: '请联系客户完成复查', status: 'planned' };
  assert.equal(eligible(old), true);
  const due = nextDate('2026-11-25', new Date('2026-11-17T02:00:00Z'));
  assert.equal(due.toISOString(), '2026-11-25T01:00:00.000Z');
  const next = successor(old, due, '已联系客户，本次未去检查，约定下周再联系');
  assert.equal(next.assessmentActionKey, 'medical-deferred:old-task');
  assert.equal(next.sourceType, 'report_followup');
  assert.equal(next.sourceId, old._id);
  assert.equal(next.formData.category, 'examination');
  assert.deepEqual(next.managementIssueIds, old.managementIssueIds);
  assert.equal(next.status, 'planned');
  assert.equal(nextDate('2026-11-17', new Date('2026-11-17T02:00:00Z')), null);
  assert.equal(eligible({ ...old, taskRole: 'executor' }), false);
});
