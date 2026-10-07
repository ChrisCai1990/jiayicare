const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnnualPlanServiceTasks } = require('../src/utils/annualPlanServiceTasks');

test('仅提醒事项不生成服务需求单', () => {
  const rows = buildAnnualPlanServiceTasks({ confirmedAt: new Date(), moduleData: { abnormal_followup: { records: [{ items: '甲状腺超声', time: '2026-10-20', serviceMode: 'reminder' }] } } }, { assignedHealthPlanner: 'planner-1' });
  assert.deepEqual(rows, []);
});

test('单项服务只生成健康规划师服务需求单，不提前创建跨岗位任务', () => {
  const rows = buildAnnualPlanServiceTasks({ confirmedAt: new Date(), moduleData: { abnormal_followup: { records: [{ items: '甲状腺超声', time: '2026-10-20', serviceMode: 'single', serviceType: 'proxy_booking', basisSummary: '结节复查建议' }] } } }, { assignedHealthPlanner: 'planner-1' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].assignedTo, 'planner-1');
  assert.equal(rows[0].stage, 'service_request');
  assert.match(rows[0].content, /预约和随访由健管专员办理/);
});

test('全托管先形成服务需求单并保留原始管理事项快照', () => {
  const record = { items: '门诊综合评估', visit_time: '2026-11-10', serviceMode: 'managed', customerAction: '上传既往报告' };
  const rows = buildAnnualPlanServiceTasks({ confirmedAt: new Date(), moduleData: { medical_treatment: { records: [record] } } }, { assignedHealthPlanner: 'planner-1' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].formData.serviceRequest.mode, 'managed');
  assert.deepEqual(rows[0].formData.serviceRequest.itemSnapshot, record);
});

test('就医协助需求保留健康顾问的目标与完成标准', () => {
  const record = { items: '专科评估', visit_time: '2026-11-10', serviceMode: 'single',
    goal: '明确后续管理方向', completionStandard: '回收专科意见并由健康顾问确认下一步' };
  const [task] = buildAnnualPlanServiceTasks({ confirmedAt: new Date(), moduleData: {
    medical_treatment: { records: [record] },
  } }, { assignedHealthPlanner: 'planner-1' });
  assert.match(task.content, /管理目标：明确后续管理方向/);
  assert.match(task.content, /完成标准：回收专科意见并由健康顾问确认下一步/);
  assert.deepEqual(task.formData.serviceRequest.itemSnapshot, record);
});
