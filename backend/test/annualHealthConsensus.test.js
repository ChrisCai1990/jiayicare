const test = require('node:test');
const assert = require('node:assert/strict');

test('顾问共识事项需完整沟通安排，并关联存在的管理问题', () => {
  const validate = require('../src/utils/annualPlanPublishValidation').validate;
  const today = '2026-11-17';
  const row = { consensusId: 'consensus-1', currentUnderstanding: '担心检查有害', concern: '担心费用',
    question: '复查的必要性是什么？', method: '面谈', frequency: '首次沟通后再约', firstDate: '2026-11-20', sourceIds: ['management_issue:1'] };
  const plan = { management_targets: { records: [{ issueId: 'management_issue:1', goal: '完成复查' }] }, health_consensus: { records: [row] } };
  assert.equal(validate(plan, today), '');
  assert.match(validate({ ...plan, health_consensus: { records: [{ ...row, firstDate: '' }] } }, today), /首次日期/);
  assert.match(validate({ ...plan, health_consensus: { records: [{ ...row, sourceIds: ['missing'] }] } }, today), /已变化/);
});

test('共识沟通只派顾问一条内部任务，客户只看适宜展示的问题与安排', async t => {
  const team = { assignedFamilyDoctor: 'aaaaaaaaaaaaaaaaaaaaaaaa', assignedHealthManager: 'bbbbbbbbbbbbbbbbbbbbbbbb' };
  const User = require('../src/models/User');
  const Admin = require('../src/models/Admin');
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => team }) }));
  t.mock.method(Admin, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  const row = { consensusId: 'consensus-1', currentUnderstanding: '担心检查有害', concern: '担心费用',
    question: '复查的必要性是什么？', method: '面谈', frequency: '每月一次', firstDate: '2026-12-01', sourceIds: ['management_issue:1'] };
  const plan = { _id: 'plan-1', patientId: 'patient-1', createdBy: 'advisor', moduleData: { health_consensus: { records: [row] } } };
  const tasks = await require('../src/utils/annualPlanFollowUps').buildAnnualPlanFollowUps(plan);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].assignedTo, team.assignedFamilyDoctor);
  assert.equal(tasks[0].clientVisible, false);
  assert.deepEqual(tasks[0].managementIssueIds, ['management_issue:1']);
  assert.equal(tasks[0].sourceScheduleKey, 'health-consensus:consensus-1');
  const presentation = require('../src/utils/annualPlanPresentation');
  const customer = presentation.customerModuleData(plan.moduleData);
  assert.equal(customer.health_consensus.records[0].question, row.question);
  assert.equal(customer.health_consensus.records[0].concern, undefined);
  assert.equal(customer.health_consensus.records[0].currentUnderstanding, undefined);
});
