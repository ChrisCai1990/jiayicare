const test = require('node:test');
const assert = require('node:assert/strict');
const { draftPlanActions, validatePlanCoverage, managementTargets } = require('./annualManagementEvidence');
const { normalizeAction } = require('./annualManagementAction');

test('日常监测逐项保存，血压与体重独立带入方案并逐项校验', () => {
  const timing = { monitoring: { items: [{ type: 'bloodPressure', time: '睡前', frequency: '每日1次' }, { type: 'weight', time: '晨起', frequency: '每周1次' }] } };
  const normalized = normalizeAction({ goal: '按时监测', directions: ['monitoring'], direction: 'monitoring', directionTimings: timing });
  assert.deepEqual(normalized.directionTimings.monitoring.items, timing.monitoring.items);
  assert.throws(() => normalizeAction({ goal: '按时监测', directions: ['monitoring'], direction: 'monitoring', directionTimings: { monitoring: { items: [{ type: 'weight', time: '' }] } } }), /监测时间/);
  assert.deepEqual(normalizeAction({ goal: '按时监测', directions: ['monitoring'], direction: 'monitoring', directionTimings: { monitoring: { items: [{ type: 'waist', time: '', frequency: '每14天1次' }, { type: 'bloodPressure', time: '晨起、中午、下午、睡前', frequency: '每日1次' }] } } }).directionTimings.monitoring.items,
    [{ type: 'waist', time: '', frequency: '每14天1次' }, { type: 'bloodPressure', time: '晨起、中午、下午、睡前', frequency: '每日1次' }]);
  assert.throws(() => normalizeAction({ goal: '按时监测', directions: ['monitoring'], direction: 'monitoring', directionTimings: { monitoring: { items: [{ type: 'bloodSugar', time: '空腹', frequency: '' }] } } }), /监测周期/);
  const evidence = [{ id: 'management_issue:1', content: { direction: 'monitoring', problem: '糖尿病', directionTimings: normalized.directionTimings } }];
  const actions = draftPlanActions(evidence);
  assert.deepEqual(actions.map(action => action.record.items), ['血压', '体重']);
  assert.equal(validatePlanCoverage({ monitoring: { records: actions.map(action => action.record) } }, evidence), '');
  assert.match(validatePlanCoverage({ monitoring: { records: [actions[0].record] } }, evidence), /日常监测项目/);
});

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
  assert.equal(actions[0].record.order_dept, '呼吸科');
  assert.equal(actions[0].record.department, undefined);
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

test('同一问题多选复查、就医和营养评估，分别形成行动且逐项校验', () => {
  const evidence = [{ id: 'management_issue:combined', content: {
    direction: 'medical_treatment', directions: ['medical_treatment', 'abnormal_followup', 'nutrition_assessment'],
    problem: '脂蛋白磷脂酶A2升高', goal: '明确风险及后续处理', action: '就医并复查，完成营养评估',
    actionTiming: { mode: 'single', dateBasis: 'interval', anchorDate: '2026-11-19', intervalMonths: 2, firstDueDate: '2027-01-19' },
    reviewPlan: { kind: 'recheck', anchorDate: '2026-11-19', intervalMonths: 3, items: ['脂蛋白磷脂酶A2'], department: '心内科' },
  } }];
  const actions = draftPlanActions(evidence);
  assert.deepEqual(actions.map(row => row.key).sort(), ['abnormal_followup', 'medical_treatment']);
  assert.equal(actions.find(row => row.key === 'medical_treatment').record.visit_time, '2027-01-19');
  assert.equal(actions.find(row => row.key === 'abnormal_followup').record.time, '2027-02-19');
  const targets = managementTargets(evidence);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].nutritionRelevant, true);
  assert.deepEqual(targets[0].sourceGoals, ['安排就医', '定期复查', '营养评估']);
  const modules = { management_targets: { records: targets }, nutrition_assessment: { enabled: true },
    medical_treatment: { records: [actions.find(row => row.key === 'medical_treatment').record] },
    abnormal_followup: { records: [actions.find(row => row.key === 'abnormal_followup').record] } };
  assert.equal(validatePlanCoverage(modules, evidence), '');
  assert.match(validatePlanCoverage({ ...modules, medical_treatment: { records: [] } }, evidence), /管理方向/);
  assert.match(validatePlanCoverage({ ...modules, nutrition_assessment: { enabled: false } }, evidence), /营养评估/);
});

test('多选方向的独立日期只进入各自行动', () => {
  const evidence = [{ id: 'management_issue:timed', content: {
    direction: 'medical_treatment', directions: ['medical_treatment', 'checkup_completion', 'nutrition_assessment'],
    problem: '脂肪肝', goal: '改善指标', directionTimings: {
      medical_treatment: { mode: 'single', firstDueDate: '2027-01-19' },
      checkup_completion: { mode: 'single', firstDueDate: '2027-02-20' },
      nutrition_assessment: { mode: 'single', firstDueDate: '2026-12-01' },
    },
  } }];
  const actions = draftPlanActions(evidence);
  assert.equal(actions.find(row => row.key === 'medical_treatment').record.visit_time, '2027-01-19');
  assert.equal(actions.find(row => row.key === 'checkup_completion').record.time, '2027-02-20');
  assert.equal(managementTargets(evidence)[0].directionTimings.nutrition_assessment.firstDueDate, '2026-12-01');
});
