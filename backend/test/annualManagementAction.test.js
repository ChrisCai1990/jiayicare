const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAction, parseDraft } = require('../src/utils/annualManagementAction');
const { managementTargets } = require('../src/utils/annualManagementEvidence');

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

test('AI草稿只接受目标和行动，不接收其自行推断的排期', () => {
  assert.deepEqual(parseDraft('{"goal":"核实基线","action":"安排资料核对","firstDueDate":"2027-01-01"}'),
    { goal: '核实基线', action: '安排资料核对' });
  assert.throws(() => parseDraft('{"goal":"","action":"安排资料核对"}'), /缺少有效/);
});
