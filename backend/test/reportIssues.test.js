const test = require('node:test');
const assert = require('node:assert/strict');
const { issueSources, reconcile, extractIssues, validateIssues, annualIssueEvidence } = require('../src/utils/reportIssues');
const report = { reportItems: [
  { itemId: 'gastric', name: '胃镜', status: 'abnormal', findings: '胃窦黏膜糜烂', diagnosis: '胃炎', sourcePage: 12 },
  { itemId: 'dental', name: '口腔', status: 'unknown', findings: '牙结石', sourcePage: 4 },
  { itemId: 'normal', name: '血常规', status: 'normal', value: '正常' },
] };
test('胃镜和口腔无建议也保留，漏提和错误正常分类不能吞掉异常', () => {
  const result = reconcile(issueSources(report), [{ sourceId: 'item:gastric', status: 'normal' }, { sourceId: 'item:normal', status: 'normal' }]);
  assert.equal(result.coverage.length, 3); assert.equal(result.issues.length, 2);
  assert.equal(result.issues[0].page, 12); assert.match(result.issues[0].evidence, /胃窦黏膜糜烂/);
  assert.equal(result.issues[1].needsVerification, true); assert.equal(result.issues[1].originalRecommendation, '');
});
test('原文建议不允许伪造，系统建议不能自动成为顾问确认意见', () => {
  const result = reconcile(issueSources(report), [{ sourceId: 'item:dental', status: 'problem', originalRecommendation: '马上洁牙', suggestedRecommendation: '口腔评估及是否需洁牙' }]);
  const dental = result.issues.find(row => row.id === 'item:dental');
  assert.equal(dental.originalRecommendation, ''); assert.equal(dental.advisorRecommendation, '');
  assert.equal(dental.suggestedRecommendation, '口腔评估及是否需洁牙');
});
test('批次之外及过长项目不截断，保留待核实和完整原文', async () => {
  const long = '所见'.repeat(10000); let count = 0;
  const result = await extractIssues({ reportItems: [...Array.from({ length: 25 }, (_, i) => ({ itemId: String(i), name: `检查${i}`, findings: '待核实' })), { itemId: 'long', name: '长报告', findings: long }] }, { chat: async messages => { count++; return JSON.stringify({ items: JSON.parse(messages[0].content).map(item => ({ sourceId: item.id, status: 'uncertain' })) }); } });
  assert.equal(count, 3); assert.equal(result.coverage.length, 26); assert.equal(result.issues.length, 26);
  assert.equal(result.issues.find(row => row.id === 'item:long').evidence, long);
});
test('确认前逐项填写建议或排除原因，不允许删除问题或篡改原文', () => {
  const stored = reconcile(issueSources(report), []).issues;
  assert.throws(() => validateIssues([], stored), /不能直接删除/);
  assert.throws(() => validateIssues(stored, stored, { confirm: true }), /逐项确认建议/);
  const input = stored.map(row => ({ ...row, evidence: '伪造', advisorRecommendation: '补充资料后评估' }));
  assert.equal(validateIssues(input, stored, { confirm: true })[0].evidence, stored[0].evidence);
  input[0].decision = 'exclude'; assert.throws(() => validateIssues(input, stored, { confirm: true }), /说明原因/);
  input[0].exclusionReason = '与第二项合并'; assert.equal(validateIssues(input, stored, { confirm: true })[0].decision, 'exclude');
});
test('年度只融合已确认且当前有效来源，排除项不生成行动依据', async () => {
  const { sourceDigest } = require('../src/utils/reportFollowUpSource');
  const current = { ...report, _id: 'report', user: 'patient', audit_status: 'audited', followUpSourceEvent: { sequence: 2 } };
  const rows = [{ _id: 'draft', patientId: 'patient', reportId: 'report', sourceSequence: 2, sourceKey: `report:2:${sourceDigest(current)}`, issueDrafts: [{ id: 'gastric', title: '胃镜异常', advisorRecommendation: '顾问确认意见' }, { id: 'dental', decision: 'exclude' }] }, { _id: 'old', sourceSequence: 1 }];
  const result = await annualIssueEvidence('patient', { Draft: { find: query => { assert.equal(query.status, 'approved'); return { sort: () => ({ lean: async () => rows }) }; } }, Report: { findById: () => ({ lean: async () => current }) } });
  assert.equal(result.length, 1); assert.equal(result[0].content.recommendation, '顾问确认意见');
});
