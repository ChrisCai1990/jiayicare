const test = require('node:test');
const assert = require('node:assert/strict');
const { draftPlanActions, validatePlanCoverage, managementTargets } = require('./annualManagementEvidence');

test('已确认复查进入方案复查条目，营养问题合并为一个评估', () => {
  const evidence = [
    { id: 'review:1', content: { direction: 'abnormal_followup', problem: '肺结节', reviewPlan: { kind: 'recheck', anchorDate: '2026-11-01', intervalMonths: 3, items: ['胸部CT'], department: '呼吸科' } } },
    { id: 'review:2', content: { direction: 'nutrition_assessment', problem: '脂肪肝' } },
    { id: 'review:3', content: { direction: 'nutrition_assessment', problem: '胆囊壁毛糙' } },
  ];
  const actions = draftPlanActions(evidence);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].key, 'abnormal_followup');
  assert.deepEqual(actions[0].record.reviewItems, ['胸部CT']);
  assert.equal(actions[0].record.department, '呼吸科');
  const targets = managementTargets(evidence);
  assert.equal(targets.filter(row => row.nutritionRelevant).length, 2);
  const moduleData = { abnormal_followup: { records: [actions[0].record] }, management_targets: { records: targets }, nutrition_assessment: { enabled: true } };
  assert.equal(validatePlanCoverage(moduleData, evidence), '');
});

test('纳入管理时确认的首次日期进入对应方案日期，待确认时间保持空白', () => {
  const evidence = [
    { id: 'visit:1', content: { direction: 'medical_treatment', problem: '肺结节', actionTiming: { mode: 'single', dateBasis: 'interval', anchorDate: '2026-11-05', intervalMonths: 6, firstDueDate: '2027-05-05' } } },
    { id: 'exam:1', content: { direction: 'checkup_completion', problem: '完善检查', actionTiming: { mode: 'rolling', firstDueDate: '2027-06-01' } } },
    { id: 'visit:2', content: { direction: 'medical_treatment', problem: '待核实问题', actionTiming: { mode: 'pending', firstDueDate: '' } } },
  ];
  const actions = draftPlanActions(evidence);
  assert.equal(actions[0].record.visit_time, '2027-05-05');
  assert.match(actions[0].record.timingReason, /6个月后就医/);
  assert.equal(actions[0].record.appointmentSchedulingVersion, 1);
  assert.equal(actions[1].record.time, '2027-06-01');
  assert.equal(actions[2].record.visit_time, undefined);
});
