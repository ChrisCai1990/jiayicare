const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const readSource = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');

test('JSON generation turns off Qwen thinking so the output budget is used for the answer', async () => {
  const source = readSource('utils/ai.js');
  let requestBody;
  const context = {
    selectProvider: () => 'qwen', getBase: () => 'https://example.invalid', getKey: () => 'test',
    controlledCall: async (_options, send) => send(),
    httpPost: async (_url, _headers, body) => {
      requestBody = body;
      return { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] };
    },
  };
  vm.runInNewContext(source.slice(source.indexOf('async function chat('), source.indexOf('// OCR + 视觉理解'))
    + '\nglobalThis.chatUnderTest = chat;', context);
  await context.chatUnderTest([{ role: 'user', content: 'synthetic' }], { jsonMode: true, maxTokens: 16384 });
  assert.equal(requestBody.enable_thinking, false);
  assert.equal(requestBody.max_tokens, 16384);
  assert.equal(requestBody.response_format.type, 'json_object');
});

test('length and empty responses are separately identified without storing clinical text', async () => {
  const source = readSource('utils/aiBudget.js');
  const context = {
    contextStorage: { getStore: () => ({}) }, randomUUID: () => 'call',
    estimateTokens: () => ({ total: 100 }), budgetScopes: () => [],
    actualUsage: () => ({ input: 20, output: 80, total: 100 }), costMicros: () => 0,
    isAiControlError: () => false, AiControlError: class extends Error {},
  };
  vm.runInNewContext(source.slice(source.indexOf('function createBudgetRunner('), source.indexOf('const controlledCall ='))
    + '\nglobalThis.createBudgetRunnerUnderTest = createBudgetRunner;', context);
  for (const [finishReason, content, expectedCode, expectedRecord] of [
    ['length', '{"sensitive":"synthetic"', 'AI_OUTPUT_LENGTH', 'OUTPUT_LENGTH'],
    ['stop', '', 'AI_EMPTY_RESPONSE', 'EMPTY_OUTPUT'],
  ]) {
    let finished;
    const db = {
      policy: async () => ({ paused: false, ocrPaused: false, failureThreshold: 8 }),
      circuit: async () => null, insert: async () => {}, outcome: async () => {},
      finish: async (_id, row) => { finished = row; },
    };
    await assert.rejects(context.createBudgetRunnerUnderTest(db)(
      { provider: 'qwen', model: 'qwen-plus', messages: [{ content: 'synthetic' }], maxTokens: 100 },
      async () => ({ choices: [{ message: { content }, finish_reason: finishReason }] }),
    ), error => error.code === expectedCode);
    assert.equal(finished.errorCode, expectedRecord);
    assert.ok(!JSON.stringify(finished).includes('sensitive'));
  }
});

test('old tumor cards are refreshed and hepatitis screening counts as changed source', () => {
  const source = readSource('routes/staff.js');
  const context = {};
  vm.runInNewContext(source.slice(source.indexOf('const activeAIHealthSummaryJobs = new Set();'),
    source.indexOf("router.post('/patients/:id/ai-health-summary',"))
    + '\nglobalThis.policy = { tumorEvidenceStale, tumorReportConditions };', context);
  assert.equal(context.policy.tumorEvidenceStale('doctor', { cancers: Array(10) }, null), true);
  assert.equal(context.policy.tumorEvidenceStale('doctor', { evidenceVersion: 2 }, null), false);
  assert.equal(context.policy.tumorEvidenceStale('nutrition', { cancers: Array(10) }, null), false);
  const hepatitisMatch = context.policy.tumorReportConditions.find(clause => clause['reportItems.name']);
  assert.match('乙肝表面抗原 HBsAg', hepatitisMatch['reportItems.name']);
  assert.match('HCV-RNA', hepatitisMatch['reportItems.name']);
});
