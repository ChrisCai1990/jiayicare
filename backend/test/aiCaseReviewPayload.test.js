const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { prepareContext, MAX_CONTEXT_CHARS } = require('../src/utils/aiCaseReviewPayload');

const medications = [
  { name: '枯草杆菌二联活菌肠溶胶囊', dosage: '1粒', frequency: '每天3次', stopped: false, aiStatus: 'approved' },
  { name: '替普瑞酮胶囊', dosage: '1粒', frequency: '每天3次', timing: '餐后', stopped: false },
  { name: '匹维溴铵片', dosage: '1片', frequency: '每天3次', timing: '餐中', stopped: false },
];
const fixture = () => ({
  sources: ['客户基本资料（当前版本）', '2026 · 用药', '当前及历史用药、营养补充记录'],
  basic: { age: 38 }, healthProfile: { healthProfile: { recentMedication: '' } },
  reports: Array.from({ length: 6 }, (_, i) => ({ title: `报告${i}`, checkDate: '2026-09-22', examConclusion: '报告正文'.repeat(9000) })),
  medications: structuredClone(medications), supplements: [], healthRecords: [], followups: [], plans: [],
  aiAnalysis: { aiHealthSummary: '旧AI分析'.repeat(11000) },
});

test('long reports cannot cut off independent medications or produce broken JSON', () => {
  const input = fixture();
  assert(JSON.stringify(input).indexOf(medications[0].name) > MAX_CONTEXT_CHARS);
  const result = prepareContext(input);
  assert(JSON.stringify(result).length <= MAX_CONTEXT_CHARS);
  assert.deepEqual(JSON.parse(JSON.stringify(result)).medications, medications);
  assert.equal(result.reports.length, 6);
  for (let i = 0; i < 6; i++) assert.equal(result.reports[i].title, `报告${i}`);
  assert(result.delivery.compressedSections.includes('reports'));
  assert(result.delivery.compressedSections.includes('aiAnalysis'));
  assert(JSON.stringify(result.reports).includes('因篇幅省略'));
  assert(result.sources.some(x => x.includes('已压缩')));
  assert.equal(input.sources[0], '客户基本资料（当前版本）');
});

test('medication clinical fields and stopped/review states survive large workflow attachments', () => {
  const item = { ...medications[0], stopped: true, stopDate: '2026-09-28', stopReason: '记录原文', aiStatus: 'pending', active: false, startDate: '2026-09-01', endDate: '2026-09-30', imageUrls: ['data:image/png;base64,' + 'x'.repeat(100000)], supplyReminder: { note: 'x'.repeat(50000) } };
  const result = prepareContext({ medications: [item], supplements: [{ name: '维生素D', brand: '测试', dosage: '按原记录', frequency: '每日', stopped: false }] });
  assert.deepEqual(result.medications[0], Object.fromEntries(Object.entries(item).filter(([key]) => !['imageUrls', 'supplyReminder'].includes(key))));
  assert.equal(result.supplements[0].brand, '测试');
});

test('unselected scopes remain distinguishable from a queried empty list', () => {
  const omitted = prepareContext({ healthProfile: { recentMedication: '' } });
  assert.equal(omitted.delivery.medicationScope, 'not_selected');
  assert.equal(omitted.medications, undefined);
  const empty = prepareContext({ medications: [], supplements: [] });
  assert.equal(empty.delivery.medicationScope, 'included');
  assert.deepEqual(empty.medications, []);
});

test('oversized critical records fail explicitly rather than silently losing medications', () => {
  assert.throws(() => prepareContext({ medications: [{ name: '药物', note: 'x'.repeat(50000) }], reports: [] }), /超出单轮容量/);
  assert.throws(() => prepareContext({ medications: 'unexpected' }), /格式异常/);
});

test('escaped strings and many records stay inside the serialized budget with visible omissions', () => {
  const result = prepareContext({ sources: ['监测'], healthRecords: Array.from({ length: 180 }, () => ({ note: '\\"\n'.repeat(500), value: 12, status: 'attention' })), reports: [], medications });
  assert(JSON.stringify(result).length <= MAX_CONTEXT_CHARS);
  assert.equal(result.healthRecords.length, 180);
  assert.equal(result.healthRecords[179].value, 12);
  assert.deepEqual(result.medications, medications);
});

test('small context keeps all data without unnecessary compression', () => {
  const input = { sources: ['报告'], reports: [{ title: '检查', examConclusion: '原始结论' }], medications };
  const result = prepareContext(input);
  assert.deepEqual(result.reports, input.reports);
  assert.deepEqual(result.sources, input.sources);
  assert.deepEqual(result.delivery.compressedSections, []);
});

test('report projection preserves measurements, reference ranges and findings while removing UI metadata', () => {
  const item = { name: '检验项目', value: '2.52', unit: 'mmol/L', referenceRange: '0.3-1.7', status: 'abnormal', findings: '检查所见原文', diagnosis: '记录原文', examDate: '2026-09-22', manualReviewStatus: 'reviewed', screeningKeys: ['x'.repeat(100000)], matchConfidence: 0.9, institution: '' };
  const result = prepareContext({ reports: [{ title: '报告', reportItems: [item] }] });
  assert.deepEqual(result.reports[0].reportItems[0], Object.fromEntries(Object.entries(item).filter(([key]) => !['screeningKeys', 'matchConfidence', 'institution', 'manualReviewStatus'].includes(key))));
  assert.equal(result.delivery.compressedSections.length, 0);
});

test('message route persists the exact context returned by the provider', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/aiCaseReviews.js'), 'utf8');
  const start = source.indexOf("router.post('/patients/:patientId/ai-case-reviews/:topicId/messages'");
  const end = source.indexOf("router.patch('/patients/:patientId/ai-case-reviews/:topicId/messages/:messageId'", start);
  let handler, stored;
  const contextSnapshot = prepareContext(fixture());
  const topic = { _id: 'topic', generation: { requestId: 'request', status: 'running' }, messages: [{ role: 'staff', requestId: 'request', content: '核对用药' }], contextScopes: ['medications'] };
  vm.runInNewContext(source.slice(start, end), {
    router: { post(_path, _auth, fn) { handler = fn; } }, staffAuth() {}, ROLE_LABEL: {}, AUTO_REVIEW_MESSAGE: '【系统自动启动研判】',
    caseReviewPatientOr404: async () => ({ _id: 'patient' }), acceptSend: async () => ({ topic, claimed: true }),
    finishSend: async (_model, _topic, generate) => { stored = await generate(); },
    buildContext: async () => fixture(), providerAdapter: { reply: async () => ({ content: '测试', contextSnapshot }) },
    AiCaseReview: { findOne: async () => ({ generation: { status: 'completed' } }) }, forClient: value => value, console,
  });
  const response = { status() { return this; }, json() { return this; } };
  await handler({ params: { topicId: 'topic' }, staff: { _id: 'staff' }, body: { content: '核对用药' } }, response);
  assert.equal(stored.snapshot, contextSnapshot);
});

test('年度综合研判首次讨论留足输出空间并约束篇幅', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/aiCaseReviews.js'), 'utf8');
  const start = source.indexOf("router.post('/patients/:patientId/ai-case-reviews/:topicId/messages'");
  const end = source.indexOf("router.patch('/patients/:patientId/ai-case-reviews/:topicId/messages/:messageId'", start);
  let handler, options;
  const topic = { _id: 'topic', reviewType: 'annual', annualPlanYear: 2026, generation: { requestId: 'saved-request', status: 'running' }, messages: [{ role: 'staff', requestId: 'saved-request', content: '结合客户资料分析' }], contextScopes: ['basic'] };
  vm.runInNewContext(source.slice(start, end), {
    router: { post(_path, _auth, fn) { handler = fn; } }, staffAuth() {}, ROLE_LABEL: {}, AUTO_REVIEW_MESSAGE: '【系统自动启动研判】',
    caseReviewPatientOr404: async () => ({ _id: 'patient' }), acceptSend: async () => ({ topic, claimed: true }),
    finishSend: async (_model, _topic, generate) => { await generate(); },
    buildContext: async () => ({ sources: [] }), annualSpecialtySummary: async () => [], providerAdapter: { reply: async value => { options = value; return { content: '测试回复' }; } },
    AiCaseReview: { findOne: async () => ({ ...topic, generation: { status: 'completed' } }) }, forClient: value => value, console,
  });
  const response = { status() { return this; }, json() { return this; } };
  await handler({ params: { topicId: 'topic' }, staff: { _id: 'staff' }, body: { content: '结合客户资料分析' } }, response);
  assert.equal(options.maxTokens, 5000);
  assert.equal(options.retryOnEmptyOrLength, true);
  assert.match(options.prompt, /每张卡最多260个汉字/);
  assert.match(options.prompt, /结合客户资料分析/);
});

test('provider sends and returns exactly the same packed snapshot, prioritizing latest records', async () => {
  let sent, options;
  const sandbox = { module: { exports: {} }, process: { env: { QWEN_API_KEY: 'synthetic' } }, require: key => key === './ai' ? { chat: async (messages, config) => { sent = messages; options = config; return '测试回复'; } } : { prepareContext } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/utils/aiCaseReviewProvider.js'), 'utf8'), sandbox);
  const result = await sandbox.module.exports.reply({ prompt: '核对用药', context: fixture(), history: [{ role: 'assistant', content: '旧回复：无用药' }] });
  const delivered = sent.at(-1).content.split('【本轮客户资料快照】\n')[1];
  assert.equal(delivered, JSON.stringify(result.contextSnapshot));
  assert.deepEqual(JSON.parse(delivered).medications, medications);
  assert(options.systemPrompt.includes('档案字段为空不能否定'));
  assert(options.systemPrompt.includes('最新资料快照优先于旧AI回复'));
});

test('provider reads uploaded report images before answering and includes extracted values', async () => {
  let sent;
  const sandbox = { module: { exports: {} }, process: { env: { QWEN_API_KEY: 'synthetic' } }, require: key => {
    if (key === './ai') return { chat: async messages => { sent = messages; return '图中有血红蛋白结果'; } };
    if (key === './aiCaseReviewAttachments') return { readAttachmentImages: async () => '第1张：2024-03-01 血红蛋白 93.2 g/L' };
    return { prepareContext };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/utils/aiCaseReviewProvider.js'), 'utf8'), sandbox);
  const result = await sandbox.module.exports.reply({ prompt: '核对贫血', context: { sources: [] }, attachments: [{ name: '报告.png', url: '/api/uploads/image.png' }] });
  assert.match(sent.at(-1).content, /血红蛋白 93\.2 g\/L/);
  assert.match(result.contextSnapshot.sources.at(-1), /已逐张视觉识别/);
});

test('annual provider retries one empty or truncated reply with shorter cards and more output space', async () => {
  const calls = [];
  const sandbox = { module: { exports: {} }, process: { env: { QWEN_API_KEY: 'synthetic' } }, require: key => key === './ai' ? { chat: async (messages, config) => {
    calls.push({ messages, config });
    if (calls.length === 1) throw new Error('AI 返回空内容或输出被截断，请人工核对');
    return '【问题：血压】\n当前判断：待复核。';
  } } : { prepareContext } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/utils/aiCaseReviewProvider.js'), 'utf8'), sandbox);
  const result = await sandbox.module.exports.reply({ prompt: '年度综合研判', context: { sources: ['已审核记录'] }, maxTokens: 5000, retryOnEmptyOrLength: true });
  assert.match(result.content, /血压/);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].config.maxTokens, 6500);
  assert.match(calls[1].messages.at(-1).content, /每个问题最多180字/);
  assert.equal(calls[0].messages.at(-1).content.includes('已审核记录'), true);
});
