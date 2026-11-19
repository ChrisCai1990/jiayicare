const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAction, parseDraft } = require('../src/utils/annualManagementAction');
const { managementTargets, draftPlanActions } = require('../src/utils/annualManagementEvidence');

test('顾问确认的目标、行动与首次日期带入年度管理目标', () => {
  const action = normalizeAction({ goal: '完成问题评估并确认后续路径', action: '安排专科就诊并回收病历',
    actionTiming: { mode: 'single', firstDueDate: '2026-12-10' } });
  const targets = managementTargets([{ id: 'management_issue:1', content: {
    problem: '待评估问题', direction: 'medical_treatment', reportTitle: '体检报告', ...action,
  } }]);
  assert.equal(targets[0].goal, action.goal);
  assert.match(targets[0].focus, /安排专科就诊并回收病历/);
  assert.deepEqual(targets[0].actionTiming, { mode: 'single', firstDueDate: '2026-12-10', frequency: '' });
});

test('复查时间由已确认的复查计划推导，不接受另写一套时间', () => {
  const action = normalizeAction({ goal: '完成本轮复查', action: '专科就诊、检查并回收专家意见',
    actionTiming: { mode: 'single', firstDueDate: '2026-12-01' } },
  { kind: 'recheck', anchorDate: '2026-10-31', intervalMonths: 3 });
  assert.deepEqual(action.actionTiming, { mode: 'rolling', firstDueDate: '2027-01-31',
    frequency: '完成本轮检查和专家评估后，由健康顾问确认下一轮' });
});

test('执行方式不能保存不完整日期或滚动依据', () => {
  const base = { goal: '建立基线', action: '核对检查资料' };
  assert.throws(() => normalizeAction({ ...base, actionTiming: { mode: 'single', firstDueDate: '2026-02-30' } }), /日期/);
  assert.throws(() => normalizeAction({ ...base, actionTiming: { mode: 'rolling', firstDueDate: '2026-12-10' } }), /滚动/);
  assert.deepEqual(normalizeAction(base).actionTiming, { mode: 'pending', firstDueDate: '', frequency: '' });
});

test('安排就医可从起算日按月计算建议日期并保留计算依据', () => {
  const base = { direction: 'medical_treatment', goal: '核实肺结节', action: '安排专科就医' };
  const action = normalizeAction({ ...base, actionTiming: { mode: 'single', dateBasis: 'interval', anchorDate: '2026-10-31', intervalMonths: 6 } });
  assert.deepEqual(action.actionTiming, { mode: 'single', firstDueDate: '2027-04-30', frequency: '',
    dateBasis: 'interval', anchorDate: '2026-10-31', intervalMonths: 6 });
  assert.throws(() => normalizeAction({ ...base, actionTiming: { mode: 'single', dateBasis: 'interval', anchorDate: '2026-10-31', intervalMonths: 6, firstDueDate: '2027-05-01' } }), /不一致/);
  assert.throws(() => normalizeAction({ ...base, actionTiming: { mode: 'single', dateBasis: 'interval', anchorDate: '', intervalMonths: 6 } }), /起算日期/);
  assert.throws(() => normalizeAction({ ...base, direction: 'vaccine', actionTiming: { mode: 'single', dateBasis: 'interval', anchorDate: '2026-10-31', intervalMonths: 6 } }), /仅适用于安排就医/);
});

test('按月计算的就医日期进入年度方案后，预约随访提前七天', async t => {
  const User = require('../src/models/User'), Admin = require('../src/models/Admin');
  const manager = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ assignedHealthManager: manager }) }) }));
  t.mock.method(Admin, 'find', () => ({ select: () => ({ lean: async () => [{ _id: manager, name: '测试健管' }] }) }));
  const action = normalizeAction({ direction: 'medical_treatment', goal: '明确原因', action: '安排专科就医',
    actionTiming: { mode: 'single', dateBasis: 'interval', anchorDate: '2026-10-31', intervalMonths: 6 } });
  const draft = draftPlanActions([{ id: 'management_issue:1', content: { problem: '肺结节', direction: 'medical_treatment', ...action } }])[0].record;
  const rows = await require('../src/utils/annualPlanFollowUps').buildAnnualPlanFollowUps({ _id: 'plan', patientId: 'patient', moduleData: { medical_treatment: { records: [draft] } } });
  assert.equal(draft.visit_time, '2027-04-30');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date.toISOString().slice(0, 10), '2027-04-23');
  assert.equal(rows[0].assignedTo, manager);
});

test('AI草稿只接受目标和行动，不接收其自行推断的排期', () => {
  assert.deepEqual(parseDraft('{"goal":"核实基线","action":"安排资料核对","firstDueDate":"2027-01-01"}'),
    { goal: '核实基线', action: '安排资料核对' });
  assert.throws(() => parseDraft('{"goal":"","action":"安排资料核对"}'), /缺少有效/);
});
