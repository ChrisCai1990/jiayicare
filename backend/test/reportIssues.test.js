const test = require('node:test');
const assert = require('node:assert/strict');
const { issueSources, reconcile, extractIssues, validateIssues, annualIssueEvidence } = require('../src/utils/reportIssues');
const report = { reportItems: [
  { itemId: 'gastric', name: '胃镜', status: 'abnormal', findings: '胃窦黏膜糜烂', diagnosis: '胃炎', sourcePage: 12 },
  { itemId: 'dental', name: '口腔', status: 'unknown', findings: '牙结石', sourcePage: 4 },
  { itemId: 'normal', name: '血常规', status: 'normal', value: '正常' },
] };
test('issue evidence uses the confirmed page date', () => {
  const sources = issueSources({ checkDate: '', pageDates: { 12: '2026-09-23' }, reportItems: [
    { itemId: 'us', name: '肝脏超声', sourcePage: 12, examDate: '2026-09-22' },
  ] });
  assert.equal(sources[0].date, '2026-09-23');
});
test('明确正常结论归档，复查要求、异常标记及混合所见不能被忽略', () => {
  const { explicitNormal, reviewView } = require('../src/utils/reportIssues');
  const source = { id: 'us', name: '甲状腺超声', status: 'unknown', evidence: '未见明显异常' };
  assert.equal(explicitNormal(source), true);
  assert.equal(reconcile([source], []).coverage[0].status, 'normal');
  const row = { purpose: 'annual_report_input', status: 'advisor_review', issueSources: [source], issueDrafts: [], issueCoverage: [{ sourceId: 'us', status: 'pending' }] };
  assert.equal(reviewView(row).issueCoverage[0].status, 'normal');
  assert.equal(row.issueCoverage[0].status, 'pending');
  for (const evidence of ['未见明显异常，建议年度复查', '未见明显异常\n肺结节', '未见明显异常改变以外的病变']) assert.equal(explicitNormal({ ...source, evidence }), false);
  assert.equal(explicitNormal({ ...source, status: 'abnormal' }), false);
  assert.equal(explicitNormal({ ...source, status: 'attention' }), false);
});

test('问题分析与建议分开保存，不能由客户端篡改系统分析', () => {
  const result = reconcile(issueSources(report), [{ sourceId: 'item:gastric', status: 'problem', problems: [{ title: '胃窦黏膜糜烂', quote: '胃窦黏膜糜烂', analysis: '胃镜记录黏膜糜烂，需结合病理资料核对。', suggestedRecommendation: '补充病理资料后评估' }] }]);
  const issue = result.issues[0];
  assert.match(issue.analysis, /病理资料/);
  assert.equal(issue.advisorRecommendation, '');
  assert.equal(validateIssues([{ ...issue, analysis: '篡改分析' }], result.issues)[0].analysis, issue.analysis);
});
test('同报告明确数值范围内的未知标记无需重复核对，不猜测复杂范围或覆盖异常', () => {
  const { withinSourceRange, reviewView } = require('../src/utils/reportIssues');
  for (const [value, range] of [['10.83', '3—100'], ['0.292', '0.15—1.00'], ['2.10nmol/L', '0.98—2.99'], ['108.51nmol/L', '57.1—178.5']]) {
    const source = { id: 'lab', status: 'unknown', evidence: `结果：${value}\n参考范围：${range}` };
    assert.equal(withinSourceRange(source), true);
    const view = reviewView({ purpose: 'annual_report_input', status: 'advisor_review', issueSources: [source], issueDrafts: [], issueCoverage: [{ sourceId: 'lab', status: 'pending' }] });
    assert.equal(view.issueCoverage[0].status, 'normal');
    assert.equal(withinSourceRange({ ...source, status: 'abnormal' }), false);
    assert.equal(withinSourceRange({ ...source, evidence: source.evidence + '\n其他异常所见' }), false);
  }
  for (const evidence of ['结果：12\n参考范围：3—10', '结果：2\n参考范围：成人1—3，儿童2—5', '结果：2\n参考范围：<3', '结果：2mg/L\n参考范围：1—3g/L', '结果：2↑\n参考范围：1—3']) assert.equal(withinSourceRange({ evidence }), false);
});
test('胃镜和口腔无建议也保留，漏提和错误正常分类不能吞掉异常', () => {
  const result = reconcile(issueSources(report), [{ sourceId: 'item:gastric', status: 'normal' }, { sourceId: 'item:normal', status: 'normal' }]);
  assert.equal(result.coverage.length, 3); assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].page, 12); assert.match(result.issues[0].evidence, /胃窦黏膜糜烂/);
  assert.equal(result.coverage.find(row => row.sourceId === 'item:dental').status, 'pending');
});
test('原文建议不允许伪造，系统建议不能自动成为顾问确认意见', () => {
  const result = reconcile(issueSources(report), [{ sourceId: 'item:dental', status: 'problem', originalRecommendation: '马上洁牙', suggestedRecommendation: '口腔评估及是否需洁牙' }]);
  const dental = result.issues.find(row => row.id === 'item:dental');
  assert.equal(dental.originalRecommendation, ''); assert.equal(dental.advisorRecommendation, '');
  assert.equal(dental.suggestedRecommendation, '口腔评估及是否需洁牙');
});
test('批次之外及过长项目不截断，保留待核实和完整原文', async () => {
  const long = '所见'.repeat(10000); let count = 0;
  const result = await extractIssues({ reportItems: [...Array.from({ length: 25 }, (_, i) => ({ itemId: String(i), name: `检查${i}`, findings: '待核实' })), { itemId: 'long', name: '长报告', findings: long }] }, { chat: async messages => { count++; return JSON.stringify({ items: JSON.parse(messages[0].content).map(item => ({ sourceId: item.id, status: 'uncertain', problems: [{ title: item.name, quote: item.evidence }] })) }); } });
  assert.equal(count, 3); assert.equal(result.coverage.length, 26); assert.equal(result.issues.length, 25);
  assert.equal(result.sources.find(row => row.id === 'item:long').evidence, long);
  assert.equal(result.coverage.find(row => row.sourceId === 'item:long').status, 'pending');
});

test('123项人工兜底只保留11项已标问题，104项正常不审核，8项单独判断', () => {
  const { reviewView, resolveCoverage } = require('../src/utils/reportIssues');
  const sources = Array.from({ length: 123 }, (_, i) => ({ id: String(i), name: `项目${i}`, status: i < 104 ? 'normal' : i < 115 ? 'abnormal' : 'unknown', evidence: '原始结果' }));
  const row = { purpose: 'annual_report_input', status: 'advisor_review', issueSources: sources,
    issueCoverage: sources.map(source => ({ sourceId: source.id, status: 'uncertain', reason: '未获得完整提取结果，需顾问核对' })),
    issueDrafts: sources.map(source => ({ id: source.id, title: source.name, advisorRecommendation: '', originalRecommendation: '', suggestedRecommendation: '' })) };
  const view = reviewView(row);
  assert.equal(view.issueDrafts.length, 11); assert.equal(view.issueCoverage.filter(x => x.status === 'normal').length, 104);
  assert.equal(view.issueCoverage.filter(x => x.status === 'pending').length, 8); assert.equal(row.issueDrafts.length, 123);
  const resolved = resolveCoverage(view, { '115': 'normal', '116': 'problem' });
  assert.equal(resolved.issueDrafts.length, 12); assert.equal(resolved.issueCoverage.filter(x => x.status === 'pending').length, 6);
  row.issueDrafts[0].advisorRecommendation = '已有人工意见';
  assert.equal(reviewView(row).issueDrafts.length, 12);
});

test('AI漏答或无效返回不能伪装成123项临床待核实', async () => {
  for (const response of ['{}', '{"items":[]}', '{"items":[null]}']) {
    await assert.rejects(extractIssues(report, { chat: async () => response }), /缺项或格式无效/);
  }
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

test('一份CT拆成多个问题，脂肪肝跨检查合并且代谢问题保持独立', () => {
  const sources = [
    { id: 'ct', name: '胸部CT', status: 'abnormal', date: '2026-08-01', page: 20, evidence: '肺内结节。脂肪肝。' },
    { id: 'us', name: '肝脏超声', status: 'abnormal', date: '2026-09-01', page: 21, evidence: '轻度脂肪肝。' },
    { id: 'lab', name: '甘油三酯', status: 'abnormal', evidence: '甘油三酯升高' },
  ];
  const result = reconcile(sources, [
    { sourceId: 'ct', status: 'problem', problems: [{ title: '肺结节', quote: '肺内结节' }, { title: '脂肪肝', quote: '脂肪肝' }] },
    { sourceId: 'us', status: 'problem', problems: [{ title: '轻度脂肪肝', quote: '轻度脂肪肝' }] },
    { sourceId: 'lab', status: 'problem', problems: [{ title: '甘油三酯升高', quote: '甘油三酯升高' }] },
  ]);
  assert.equal(result.issues.length, 3);
  const liver = result.issues.find(x => x.problemKey === 'fatty_liver');
  assert.deepEqual(liver.sourceIds, ['ct', 'us']);
  assert.deepEqual(liver.sourceRefs.map(x => x.date), ['2026-08-01', '2026-09-01']);
  assert.equal(result.issues.filter(x => x.group === 'metabolic').length, 2);
  assert.equal(result.issues.find(x => x.problemKey === 'lung_nodule').group, 'respiratory');
  assert.throws(() => reconcile(sources, [{ sourceId: 'ct', status: 'problem', problems: [{ title: '肺结节', quote: '编造结论' }] }]), /原文依据/);
});

test('合并保留顾问不同意见，重新整理保留未对应意见且ID不冲突', () => {
  const { mergeProblems, identity } = require('../../shared/reportProblems.cjs');
  const { preserveOpinions } = require('../src/utils/reportIssues');
  const old = [{ id: 'a', title: '脂肪肝', advisorRecommendation: '意见甲' }, { id: 'b', title: '轻度脂肪肝', advisorRecommendation: '意见乙' }];
  const merged = mergeProblems(old);
  assert.equal(merged.length, 1); assert.equal(merged[0].advisorRecommendation, '');
  assert.deepEqual(merged[0].advisorAlternatives, ['意见甲', '意见乙']);
  assert.equal(merged[0].recommendationConflict, true);
  assert.notEqual(identity('未见脂肪肝'), identity('脂肪肝'));
  const next = [{ id: 'a', title: '脂肪肝', problemKey: 'fatty_liver' }];
  assert.equal(preserveOpinions(next, old)[0].recommendationConflict, true);
  const separate = preserveOpinions(next, [...old, { id: 'a', title: '脂肪肝', decision: 'exclude', exclusionReason: '另案处理' }, { id: 'manual:note', title: '其他', advisorRecommendation: '保留' }]);
  assert.equal(new Set(separate.map(x => x.id)).size, separate.length);
  assert.ok(separate.some(x => x.advisorRecommendation === '保留' && x.reviewCarryover));
  const renamed = validateIssues([{ ...merged[0], title: '肝内病灶' }], merged)[0];
  assert.equal(renamed.problemKey, '肝内病灶');
});

test('年度同一问题跨已确认报告汇总，保留不同日期和各顾问意见', async () => {
  const { sourceDigest } = require('../src/utils/reportFollowUpSource');
  const reports = ['ct', 'us'].map((id, i) => ({ ...report, _id: id, user: 'patient', audit_status: 'audited', checkDate: `2026-0${i+8}-01`, followUpSourceEvent: { sequence: 1 } }));
  const rows = reports.map((r, i) => ({ _id: `draft${i}`, patientId: 'patient', reportId: r._id, sourceSequence: 1, sourceKey: `${r._id}:1:${sourceDigest(r)}`, issueDrafts: [{ id: 'liver', title: i ? '轻度脂肪肝' : '脂肪肝', advisorRecommendation: `意见${i}` }] }));
  const result = await annualIssueEvidence('patient', { Draft: { find: () => ({ sort: () => ({ lean: async () => rows }) }) }, Report: { findById: id => ({ lean: async () => reports.find(r => r._id === id) }) } });
  assert.equal(result.length, 1);
  assert.equal(result[0].content.sourceReviews.length, 2);
  assert.equal(result[0].content.sourceReviews[1].checkDate, '2026-09-01');
  assert.match(result[0].content.recommendation, /意见0\n意见1/);
});


test('年度方案不再读取或等待独立年度问题审核', async () => {
  const annual = require('../src/utils/annualReportProblems');
  const original = annual.annualEvidence;
  annual.annualEvidence = async () => { throw new Error('不应进入独立问题审核'); };
  try {
    assert.deepEqual(await annualIssueEvidence('patient', {year: 2026,
      Draft: {find: () => ({sort: () => ({lean: async () => []})})}, Report: {},
    }), []);
  } finally { annual.annualEvidence = original; }
});
