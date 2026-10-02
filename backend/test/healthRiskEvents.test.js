const test = require('node:test');
const assert = require('node:assert/strict');
const { recordCandidate, reportCandidate, bloodPressureTrendCandidate, syncRiskEvent } = require('../src/utils/healthRiskEvents');
const { ruleEngineSignals, ruleEngineFloor, snapshotRiskAssessment } = require('../src/utils/aiRiskAssessment');
const riskRollout = require('../src/utils/healthRiskRollout');

test('风险发现默认关闭，白名单只接受完整会员 ID，生产环境禁止全员模式', () => {
  const first = '111111111111111111111111';
  const second = '222222222222222222222222';
  assert.equal(riskRollout.enabledForPatient(first, {}), false);
  const pilot = { NODE_ENV: 'production', HEALTH_RISK_ROLLOUT_MODE: 'allowlist', HEALTH_RISK_PATIENT_IDS: `${first},${second}` };
  assert.equal(riskRollout.enabledForPatient(first, pilot), true);
  assert.equal(riskRollout.enabledForPatient('333333333333333333333333', pilot), false);
  assert.deepEqual(riskRollout.patientFilter('user', pilot), { user: { $in: [first, second] } });
  assert.equal(riskRollout.enabledForPatient(first, { ...pilot, HEALTH_RISK_PATIENT_IDS: `${first},金娟` }), false);
  assert.equal(riskRollout.enabledForPatient(first, { ...pilot, HEALTH_RISK_ROLLOUT_MODE: 'all' }), false);
});

test('近期异常打卡形成待核对线索，普通和过时记录不形成新待办', () => {
  const recent = { type: 'bloodPressure', status: 'danger', value: '146/92', extra: { sys: 146, dia: 92 }, unit: 'mmHg', recordedAt: new Date() };
  const candidate = recordCandidate(recent);
  assert.equal(candidate.level, 'review');
  assert.equal(candidate.evidence.value, '146/92');
  assert.equal(recordCandidate({ ...recent, status: 'normal' }), null);
  assert.equal(recordCandidate({ ...recent, deletedAt: new Date() }), null);
  assert.equal(recordCandidate({ ...recent, recordedAt: new Date(Date.now() - 8 * 86400000) }), null);
  assert.equal(recordCandidate({ ...recent, type: 'bloodSugar', value: '3.2', unit: 'mmol/L' }).evidence.value, '3.2');
});

test('报告线索只来自已审核的异常或关注项目，保留原项证据', () => {
  const report = {
    title: '合成测试报告', checkDate: '2026-10-01', audit_status: 'audited',
    reportItems: [
      { itemId: 'a', name: '测试指标 A', value: '12', unit: 'u', status: 'abnormal', sourcePage: 2 },
      { itemId: 'b', name: '测试指标 B', status: 'normal' },
      { itemId: 'c', name: '测试指标 C', status: 'attention' },
      { itemId: 'd', name: '药品', status: 'abnormal', itemType: 'medication' },
    ],
  };
  assert.equal(reportCandidate({ ...report, audit_status: 'unaudited' }), null);
  assert.equal(reportCandidate({ ...report, checkDate: '2020-01-01' }), null);
  const candidate = reportCandidate(report);
  assert.equal(candidate.evidence.totalCount, 2);
  assert.deepEqual(candidate.evidence.items.map(item => item.itemId), ['a', 'c']);
  assert.equal(candidate.evidence.items[0].sourcePage, 2);
});

test('同一来源幂等；结案后只有来源变化才重开；来源纠正撤回待办', async () => {
  let row = null;
  let creates = 0;
  const Event = {
    findOne: async ({ eventKey }) => row?.eventKey === eventKey ? row : null,
    findById: async () => row,
    create: async value => { creates++; row = { _id: 'event', status: 'pending', ...value }; return row; },
    updateOne: async (_filter, update) => {
      Object.assign(row, update.$set || {});
      if (update.$push?.history) row.history.push(update.$push.history);
    },
  };
  const Patient = { findById: () => ({ select: () => ({ lean: async () => ({ tenantId: 'tenant', assignedFamilyDoctor: 'doctor' }) }) }) };
  const args = { patientId: 'patient', sourceType: 'health_record', sourceId: 'source', candidate: { ruleCode: 'test', level: 'review', title: '待核对', summary: '合成测试', evidence: { value: 'A' } } };
  const dependencies = { Event, Patient, enabledForPatient: () => true };
  await syncRiskEvent(args, dependencies);
  await syncRiskEvent(args, dependencies);
  assert.equal(creates, 1);
  assert.equal(row.assignedTo, 'doctor');
  assert.equal(row.history.length, 1);
  row.status = 'closed';
  await syncRiskEvent(args, dependencies);
  assert.equal(row.status, 'closed');
  await syncRiskEvent({ ...args, candidate: { ...args.candidate, evidence: { value: 'B' } } }, dependencies);
  assert.equal(row.status, 'pending');
  assert.equal(row.history.at(-1).action, 'reopened_after_source_change');
  await syncRiskEvent({ ...args, candidate: null }, dependencies);
  assert.equal(row.status, 'superseded');
});

test('范围外会员不会访问事件或会员数据', async () => {
  let touched = false;
  const Event = { findOne: async () => { touched = true; return null; } };
  const Patient = { findById: async () => { touched = true; return null; } };
  const result = await syncRiskEvent({ patientId: 'other', sourceType: 'health_record', sourceId: 'record', candidate: { evidence: {} } },
    { Event, Patient, enabledForPatient: () => false });
  assert.equal(result, null);
  assert.equal(touched, false);
});

test('已存在的明显异常规则信号给年度评估设置最低关注级别，并保留有限历史', () => {
  const values = { sbp: 182, dbp: 112, fpg: 7.2 };
  const floor = ruleEngineFloor(values, ruleEngineSignals(values));
  assert.equal(floor.cardiovascular, 'high');
  assert.equal(floor.diabetes, 'medium');
  assert.equal(ruleEngineFloor({}, ruleEngineSignals({})).cardiovascular, 'low');
  const snapshot = snapshotRiskAssessment({ version: 2, overallLevel: 'high', dimensions: [], discussions: [{ content: '内部讨论' }], previousVersions: [{ version: 1 }] });
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.discussions, undefined);
  assert.equal(snapshot.previousVersions, undefined);
});

test('连续三次需关注血压记录形成趋势线索，单次危险标记走原始记录线索', () => {
  const rows = [0, 1, 2].map(i => ({ _id: `r${i}`, type: 'bloodPressure', status: 'warning', value: '135/85', extra: { sys: 135, dia: 85 }, recordedAt: new Date(Date.now() - i * 86400000) }));
  const candidate = bloodPressureTrendCandidate(rows);
  assert.equal(candidate.evidence.records.length, 3);
  assert.equal(candidate.level, 'review');
  assert.equal(bloodPressureTrendCandidate(rows.slice(0, 2)), null);
  assert.equal(bloodPressureTrendCandidate([{ ...rows[0], status: 'danger' }, ...rows.slice(1)]), null);
});
