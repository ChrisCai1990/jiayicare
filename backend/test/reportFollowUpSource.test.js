const test = require('node:test');
const assert = require('node:assert/strict');
const { reportSnapshot, sourceDigest, markReportFollowUpEvent, isReportSourceCurrent, reportExclusion } = require('../src/utils/reportFollowUpSource');
const report = (changed = ['audit_status']) => ({ _id: 'report', user: 'patient', audit_status: 'audited', documentCategory: 'outpatient_record', examConclusion: '下次沟通确认安排', reportItems: [], isModified: key => changed.includes(key) });

test('审核时持久化事件；读/无关保存不入队，未审核和处方不入队', () => {
  const r = report(); markReportFollowUpEvent(r);
  assert.equal(r.followUpSourceEvent.status, 'queued');
  assert.equal(r.followUpSourceEvent.sequence, 1);
  r.isModified = () => false; markReportFollowUpEvent(r);
  assert.equal(r.followUpSourceEvent.sequence, 1);
  for (const patch of [{ audit_status: 'unaudited' }, { documentCategory: 'prescription_order' }]) {
    const excluded = { ...report(), ...patch }; markReportFollowUpEvent(excluded); assert.equal(excluded.followUpSourceEvent, undefined);
  }
});
test('修改临床内容、撤审后重审生成新版本；原样重复保存不重复', () => {
  const r = report(); markReportFollowUpEvent(r);
  r.isModified = key => key === 'examConclusion'; markReportFollowUpEvent(r);
  assert.equal(r.followUpSourceEvent.sequence, 1);
  r.examConclusion = '新建议'; markReportFollowUpEvent(r); assert.equal(r.followUpSourceEvent.sequence, 2);
  r.examConclusion = '下次沟通确认安排'; markReportFollowUpEvent(r); assert.equal(r.followUpSourceEvent.sequence, 3);
  r.isModified = key => key === 'audit_status'; markReportFollowUpEvent(r); assert.equal(r.followUpSourceEvent.sequence, 4);
});
test('快照只取审核原文，排除文件base64、AI总结及联系方式', () => {
  const r = { ...report(), content: 'secret file', aiSummary: 'unreviewed AI opinion', phone: 'private', keyFindings: ['AI推断'], reportItems: [{ name: '检查', conclusion: '原文意见', aiExplanation: '推断' }] };
  const snapshot = JSON.stringify(reportSnapshot(r));
  assert.match(snapshot, /原文意见/); assert.doesNotMatch(snapshot, /secret|unreviewed|private|推断/);
});
test('患者、审核状态、序号和来源内容必须全部匹配才允许发布', () => {
  const r = report(); markReportFollowUpEvent(r);
  const draft = { patientId: r.user, sourceSequence: 1, sourceKey: `${r._id}:1:${sourceDigest(r)}` };
  assert.equal(isReportSourceCurrent(draft, r), true);
  for (const changed of [null, { ...r, user: 'other' }, { ...r, audit_status: 'rejected' }, { ...r, examConclusion: '已变更' }, { ...r, followUpSourceEvent: { sequence: 2 } }]) assert.equal(isReportSourceCurrent(draft, changed), false);
});
test('已有服务、异常复查、条件服务、会诊或随访全部排除', async () => {
  const empty = { AbnormalReview: { exists: async () => false }, FollowUp: { exists: async () => false }, HealthPlan: { exists: async () => false }, Referral: { exists: async () => false } };
  assert.equal(await reportExclusion(report(), empty), '');
  for (const field of ['sourceOrderId', 'sourceHealthPlanId', 'sourceServiceRecordId', 'planId']) assert.ok(await reportExclusion({ ...report(), [field]: 'service' }, {}));
  for (const name of Object.keys(empty)) assert.ok(await reportExclusion(report(), { ...empty, [name]: { exists: async () => true } }));
});
