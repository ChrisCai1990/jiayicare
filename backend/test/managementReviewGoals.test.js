const test = require('node:test');
const assert = require('node:assert/strict');
const { goalReviews, reviewedGoals } = require('../src/utils/managementReviewGoals');

test('review snapshots confirmed annual goals and linked tasks without inferring achievement', () => {
  const period = { start: '2026-10-01', end: '2026-10-31' };
  const plans = [{ _id: 'plan-1', confirmedAt: '2026-09-01', moduleData: { management_targets: { records: [
    { issueId: 'management_issue:1', goal: '复查血压', focus: '安排复查', sourceTitle: '体检报告' },
  ] } } }, { _id: 'future', confirmedAt: '2026-11-01', moduleData: { management_targets: { records: [{ issueId: 'future', goal: '未来目标' }] } } }];
  const tasks = [{ _id: 'task-1', date: '2026-10-20', status: 'completed', managementIssueIds: ['management_issue:1'], executedContent: '已提醒，客户尚未检查' }];
  const rows = goalReviews(plans, tasks, period);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].goal, '复查血压');
  assert.equal(rows[0].taskEvidence[0].status, 'completed');
  assert.equal(rows[0].outcome, 'unverified');
  assert.throws(() => reviewedGoals(rows, [{ ...rows[0], outcome: 'achieved', outcomeNote: '' }]));
  assert.equal(reviewedGoals(rows, [{ ...rows[0], outcome: 'unverified', outcomeNote: '尚缺复查报告' }])[0].outcomeNote, '尚缺复查报告');
});

test('later task completion is not counted in an earlier period; linked rehab evidence stays distinct', () => {
  const period = { start: '2026-10-01', end: '2026-10-31' };
  const plans = [{ _id: 'plan-1', confirmedAt: '2026-09-01', moduleData: { management_targets: { records: [
    { issueId: 'management_issue:rehab', goal: '改善活动能力' },
  ] } } }];
  const tasks = [{ _id: 'task-1', date: '2026-10-20', completedAt: '2026-11-02', status: 'completed', managementIssueIds: ['management_issue:rehab'], executedContent: '11月已完成', plannedContent: '10月预约' }];
  const services = [{ _id: 'record-1', date: '2026-10-25', title: '首次运动能力评估', result: '活动能力记录', structuredContent: { rehab: { status: 'published', managementIssueIds: ['management_issue:rehab'] } } }];
  const [row] = goalReviews(plans, tasks, period, services);
  assert.equal(row.taskEvidence[0].status, 'period_end_pending');
  assert.equal(row.taskEvidence[0].summary, '10月预约');
  assert.equal(row.serviceEvidence[0].title, '首次运动能力评估');
});
