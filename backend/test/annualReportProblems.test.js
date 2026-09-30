const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/utils/annualReportProblems');
test('生产无自动索引时同客户年度仍使用相同主键，年度及客户隔离', () => {
  assert.equal(service.recordId('ABC', '2026'), service.recordId('abc', 2026));
  assert.notEqual(service.recordId('abc', 2026), service.recordId('abc', 2025));
  assert.notEqual(service.recordId('abc', 2026), service.recordId('abd', 2026));
  assert.match(service.recordId('abc', 2026), /^[a-f0-9]{24}$/);
});
const reports = [
  { _id: 'ct', reportYear: 2026, checkDate: '2026-08-01', title: 'CT', reportItems: [{ name: '胸部CT', findings: '肺结节。脂肪肝。', status: 'abnormal' }] },
  { _id: 'us', reportYear: 2026, checkDate: '2026-09-01', title: '超声及血脂', reportItems: [{ name: '肝脏超声', findings: '脂肪肝', status: 'abnormal' }] },
];
const findings = [
  { id: 'ct:liver', title: '脂肪肝', evidence: '脂肪肝', sources: [{ reportId: 'ct', date: '2026-08-01' }] },
  { id: 'us:liver', title: '脂肪肝', evidence: '脂肪肝', sources: [{ reportId: 'us', date: '2026-09-01' }] },
  { id: 'lab:tg', title: '甘油三酯升高', evidence: '2.52', sources: [{ reportId: 'lab' }] },
  { id: 'ct:lung', title: '肺结节', evidence: '肺结节', sources: [{ reportId: 'ct' }] },
];
const output = { topics: [
  { title: '体重与代谢管理', problemIds: ['ct:liver', 'us:liver', 'lab:tg'], analysis: '两份影像均有脂肪肝，结合血脂结果综合评估。', recommendation: '核对既往血脂及生活方式，制定干预安排。' },
  { title: '肺结节随访', problemIds: ['ct:lung'], analysis: '报告记录肺结节，应对照既往影像。', recommendation: '核对原报告复查要求。' },
] };
test('跨报告同问题及代谢发现综合成一个主题，肺结节保持独立且来源日期不丢', () => {
  const topics = service.compileTopics(output, findings);
  assert.equal(topics.length, 2); assert.equal(topics[0].findings.length, 3);
  assert.deepEqual(topics[0].findings.slice(0, 2).map(f => f.sources[0].date), ['2026-08-01', '2026-09-01']);
  assert.equal(topics[1].findings[0].id, 'ct:lung'); assert.equal(topics[0].reviewed, false);
});
test('拒绝漏问题、重复引用、伪造依据、空分析及将代谢主题升级诊断', () => {
  for (const change of [
    x => x.topics.pop(), x => x.topics[0].problemIds.push('ct:lung'), x => x.topics[0].problemIds.push('fake'),
    x => { x.topics[0].analysis = '' }, x => { x.topics[0].recommendation = '' }, x => { x.topics[0].title = '代谢综合征' },
  ]) { const next = structuredClone(output); change(next); assert.throws(() => service.compileTopics(next, findings)); }
});
test('顾问可修订分析建议，必须逐项审核且不能篡改来源或删除问题', () => {
  const topics = service.compileTopics(output, findings);
  assert.throws(() => service.validateReview(topics, topics, true), /逐个审核/);
  const input = topics.map(topic => ({ ...topic, reviewed: true, analysis: '顾问修订分析', findings: [] }));
  assert.equal(service.validateReview(input, topics, true)[0].findings.length, 3);
  assert.throws(() => service.validateReview(input.slice(1), topics, true), /不能遗漏/);
  input[0].decision = 'exclude'; assert.throws(() => service.validateReview(input, topics, true), /不纳入/);
  input[0].exclusionReason = '已有方案承接'; assert.equal(service.validateReview(input, topics, true)[0].decision, 'exclude');
});
test('来源指纹随报告、小结、旧顾问意见变化，重排报告不改变指纹', () => {
  const original = service.buildContext(reports, null).sourceFingerprint;
  assert.equal(service.buildContext([...reports].reverse(), null).sourceFingerprint, original);
  assert.notEqual(service.buildContext(reports.slice(1), null).sourceFingerprint, original);
  assert.notEqual(service.buildContext(reports, { sections: { summary: '新小结' } }).sourceFingerprint, original);
  assert.notEqual(service.buildContext(reports, null, [{ recommendation: '新意见' }]).sourceFingerprint, original);
});
test('综合生成输入含所有报告来源和已审核小结；未完成提取不能成为空问题', async () => {
  const context = service.buildContext(reports, { sections: { summary: '脂肪肝' } });
  const result = await service.synthesize(context, {
    extract: async (report, options) => {
      assert.equal(options.skipNormal, true);
      return { coverage: [{ status: 'problem' }], issues: [{ id: 'liver', title: '脂肪肝', evidence: '脂肪肝', sourceName: report.title }] };
    },
    chat: async messages => {
      const data = JSON.parse(messages[0].content); assert.equal(data.problems.length, 2); assert.ok(data.screeningSummary);
      return JSON.stringify({ topics: [{ ...output.topics[0], problemIds: ['ct:liver', 'us:liver'] }] });
    },
  });
  assert.equal(result.topics.length, 1); assert.equal(result.coverage.length, 2);
  await assert.rejects(service.synthesize(context, { extract: async () => ({ coverage: [{ status: 'pending' }], issues: [] }) }), /尚未完成/);
});
test('已明确正常项目不花费模型调用且覆盖记录完整', async () => {
  const result = await require('../src/utils/reportIssues').extractIssues({ reportItems: [{ name: '超声', findings: '未见明显异常', status: 'unknown' }] }, { skipNormal: true, chat: async () => { throw Error('不应调用'); } });
  assert.equal(result.issues.length, 0); assert.equal(result.coverage[0].status, 'normal');
});
test('实际问题卡主视图呈现完整分析建议，原始检查来源折叠', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const source = require('fs').readFileSync(require('path').join(__dirname, '../../staff/src/components/AnnualReportProblems.jsx'), 'utf8');
  const card = source.slice(source.indexOf('export function AnnualProblemCard'), source.indexOf('export default function'));
  const code = require('esbuild').transformSync(card.replace('export function', 'function') + '\nAnnualProblemCard;', { loader: 'jsx' }).code;
  const Card = require('vm').runInNewContext(code, { React, useState: React.useState });
  const html = renderToStaticMarkup(React.createElement(Card, { topic: service.compileTopics(output, findings)[0], index: 0, disabled: false, onChange() {} }));
  assert.match(html.slice(0, html.indexOf('<details')), /两份影像均有脂肪肝/);
  assert.match(html.slice(0, html.indexOf('<details')), /制定干预安排/);
  assert.doesNotMatch(html, /<textarea|现有资料尚不足|details open/);
  assert.match(html, /修改分析与建议/); assert.match(html, /待顾问审核/);
});


test('提取超时仅重试当前小批次，完成的来源不重复请求，重试保留超时预算', async () => {
  const report = { reportItems: Array.from({length: 7}, (_, i) => ({itemId: String(i), name: `项目${i}`, findings: '待判断'})) };
  const calls = [];
  const result = await require('../src/utils/reportIssues').extractIssues(report, {
    batchSize: 6, timeoutMs: 120000, retryTimeout: true,
    chat: async (messages, options) => {
      const group = JSON.parse(messages[0].content); calls.push(group.map(x => x.sourceId));
      assert.equal(options.timeoutMs, 120000);
      if (calls.length === 2) throw Object.assign(new Error('timeout'), {code: 'AI_TIMEOUT'});
      return JSON.stringify({ items: group.map(x => ({sourceId: x.sourceId, status: 'normal', problems: []})) });
    },
  });
  assert.deepEqual(calls.map(x => x.length), [6, 1, 1]); assert.deepEqual(calls[1], calls[2]);
  assert.equal(result.coverage.length, 7);
});

test('连续超时停止且不返回空成功；非超时错误不自动重试', async () => {
  for (const code of ['AI_TIMEOUT', 'AI_BUDGET_PAUSED']) {
    let count = 0;
    await assert.rejects(require('../src/utils/reportIssues').extractIssues({ reportItems: [{ findings: '待判断' }] }, {
      retryTimeout: true, chat: async () => { count++; throw Object.assign(new Error('failed'), { code }); },
    }), {code});
    assert.equal(count, code === 'AI_TIMEOUT' ? 2 : 1);
  }
});


test('失败页提供重试入口，不显示零问题或空覆盖记录', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const source = require('fs').readFileSync(require('path').join(__dirname, '../../staff/src/components/AnnualReportProblems.jsx'), 'utf8');
  const code = require('esbuild').transformSync(source.replace(/^import .*$/gm, '').replace('export function', 'function').replace('export default function', 'function') + '\nAnnualReportProblems;', {loader: 'jsx'}).code;
  let index = 0;
  const Component = require('vm').runInNewContext(code, { React,
    useState: value => [index++ === 0 ? { reportCount: 4, data: { status: 'failed', topics: [], coverage: [], message: 'AI响应超时' } } : value, () => {}],
    useRef: value => ({current: value}), useEffect() {},
  });
  const html = renderToStaticMarkup(React.createElement(Component, {patientId: 'p', year: 2026, canEdit: true}));
  assert.match(html, /重新生成问题与建议/); assert.match(html, /AI响应超时/);
  assert.doesNotMatch(html, /0个综合管理问题|资料范围与整理依据/);
});
