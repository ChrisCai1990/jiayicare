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

test('symptom and lifestyle observations summarize recorded days without deciding outcomes', () => {
  const period = { start: '2026-10-01', end: '2026-10-31' };
  const plans = [{ _id: 'plan-1', confirmedAt: '2026-09-01', moduleData: { management_targets: { records: [
    { issueId: 'symptom-1', goal: '缓解便秘', goalDimension: 'symptom', symptomTerm: '便秘' },
    { issueId: 'lifestyle-1', goal: '改善睡眠规律', goalDimension: 'lifestyle', lifestyleType: 'sleep' },
  ] } } }];
  const observations = [
    { type: 'symptom', value: '便秘', recordedAt: '2026-10-01T02:00:00Z' },
    { type: 'symptom', value: '便秘', recordedAt: '2026-10-01T09:00:00Z' },
    { type: 'symptom', value: '腹泻', recordedAt: '2026-10-02T02:00:00Z' },
    { type: 'sleep', value: '7.0', unit: '小时', recordedAt: '2026-10-01T02:00:00Z' },
    { type: 'sleep', value: '8.0', unit: '小时', recordedAt: '2026-10-02T02:00:00Z' },
  ];
  const rows = goalReviews(plans, [], period, [], [], [], false, observations);
  assert.deepEqual([rows[0].observationEvidence.days, rows[0].observationEvidence.count], [1, 2]);
  assert.equal(rows[0].observationEvidence.periodDays, 31);
  assert.deepEqual([rows[1].observationEvidence.days, rows[1].observationEvidence.count], [2, 2]);
  assert.equal(rows[0].outcome, 'unverified');
  assert.equal(rows[1].outcome, 'unverified');
});

test('published rehab record remains attributable when its order is linked after the record', () => {
  const period = { start: '2026-10-01', end: '2026-10-31' };
  const plans = [{ _id: 'plan-1', confirmedAt: '2026-09-01', moduleData: { management_targets: { records: [
    { issueId: 'rehab-1', goal: '改善活动能力', rehabRelevant: true },
  ] } } }];
  const services = [{ _id: 'service-1', date: '2026-10-20', title: '运动能力评估',
    structuredContent: { rehab: { orderId: 'order-1', status: 'published', managementIssueIds: [] } } }];
  const orders = [{ _id: 'order-1', rehabAnnualLink: { annualPlanId: 'plan-1', issueIds: ['rehab-1'], linkedAt: '2026-11-01' } }];
  const [row] = goalReviews(plans, [], period, services, [], [], false, [], false, orders);
  assert.equal(row.serviceEvidence.length, 1);
  assert.equal(row.serviceEvidence[0].serviceRecordId, 'service-1');
  assert.equal(row.outcome, 'unverified');
  const [other] = goalReviews(plans, [], period, services, [], [], false, [], false,
    [{ _id: 'order-1', rehabAnnualLink: { annualPlanId: 'another-plan', issueIds: ['rehab-1'] } }]);
  assert.equal(other.serviceEvidence.length, 0);
});

test('compares only a finalized prior review of the same annual issue and tracking definition', () => {
  const plans = [{ _id: 'plan-1', confirmedAt: '2026-08-01', moduleData: { management_targets: { records: [
    { issueId: 'sleep-1', goal: '改善睡眠', goalDimension: 'lifestyle', lifestyleType: 'sleep' },
  ] } } }];
  const period = { start: '2026-10-01', end: '2026-10-31' };
  const observations = [{ type: 'sleep', value: '8.0', recordedAt: '2026-10-10T02:00:00Z' }];
  const prior = [{ label: '2026年9月', end: '2026-09-30', goalReviews: [
    { issueId: 'sleep-1', annualPlanId: 'plan-1', goalDimension: 'lifestyle', lifestyleType: 'sleep', observationEvidence: { days: 20, periodDays: 30, count: 20 } },
  ] }];
  const [current] = goalReviews(plans, [], period, [], [], [], false, observations, false, [], prior);
  assert.equal(current.previousEvidence.label, '2026年9月');
  assert.equal(current.previousEvidence.observationEvidence.days, 20);
  assert.equal(current.outcome, 'unverified');
  const [changedTracking] = goalReviews(plans, [], period, [], [], [], false, observations, false, [],
    [{ ...prior[0], goalReviews: [{ ...prior[0].goalReviews[0], lifestyleType: 'mood' }] }]);
  assert.equal(changedTracking.previousEvidence, null);
  const [differentPlan] = goalReviews(plans, [], period, [], [], [], false, observations, false, [],
    [{ ...prior[0], goalReviews: [{ ...prior[0].goalReviews[0], annualPlanId: 'plan-2' }] }]);
  assert.equal(differentPlan.previousEvidence, null);
});

test('observation coverage starts when the annual goal takes effect mid-period', () => {
  const plan = [{ _id: 'plan-midmonth', confirmedAt: '2026-10-16T02:00:00Z', moduleData: { management_targets: { records: [
    { issueId: 'sleep-midmonth', goal: '记录睡眠', goalDimension: 'lifestyle', lifestyleType: 'sleep' },
  ] } } }];
  const observations = [
    { type: 'sleep', value: '7.0', recordedAt: '2026-10-10T02:00:00Z' },
    { type: 'sleep', value: '8.0', recordedAt: '2026-10-20T02:00:00Z' },
  ];
  const [row] = goalReviews(plan, [], { start: '2026-10-01', end: '2026-10-31' }, [], [], [], false, observations);
  assert.equal(row.observationEvidence.count, 1);
  assert.equal(row.observationEvidence.periodDays, 16);
});

test('goals added to a published plan do not rewrite earlier periods', () => {
  const plans = [{ _id: 'published-plan', confirmedAt: '2026-09-23T02:00:00Z', moduleData: { management_targets: { records: [
    { issueId: 'sleep-later', goal: '核对睡眠', goalDimension: 'lifestyle', lifestyleType: 'sleep', effectiveAt: '2026-11-17T02:00:00Z' },
  ] } } }];
  const observations = [
    { type: 'sleep', value: '7.0', recordedAt: '2026-11-10T02:00:00Z' },
    { type: 'sleep', value: '8.0', recordedAt: '2026-11-20T02:00:00Z' },
  ];
  assert.deepEqual(goalReviews(plans, [], { start: '2026-10-01', end: '2026-10-31' }, [], [], [], false, observations), []);
  const [row] = goalReviews(plans, [], { start: '2026-11-01', end: '2026-11-30' }, [], [], [], false, observations);
  assert.equal(row.observationEvidence.count, 1);
  assert.equal(row.observationEvidence.periodDays, 14);
});
