const test = require('node:test');
const assert = require('node:assert/strict');
const { createBudgetRunner } = require('./aiBudget');
const { DEFAULT_POLICY } = require('./aiBudgetPolicy');

test('供应商内容拒绝保留失败记录，但不计入模型连续异常', async () => {
  const outcomes = [];
  const finished = [];
  const db = {
    policy: async () => DEFAULT_POLICY,
    circuit: async () => null,
    reserve: async () => true,
    insert: async () => {},
    outcome: async (...args) => outcomes.push(args),
    finish: async (_id, row) => finished.push(row),
  };
  const run = createBudgetRunner(db);
  await assert.rejects(run({ provider: 'qwen', model: 'qwen-plus', messages: [] },
    async () => ({ error: { code: 'data_inspection_failed' } })), /AI 服务返回异常/);
  assert.equal(outcomes.length, 0);
  assert.equal(finished[0].errorCode, 'data_inspection_failed');

  await assert.rejects(run({ provider: 'qwen', model: 'qwen-plus', messages: [] },
    async () => ({ error: { code: 'model_unavailable' } })), /AI 服务返回异常/);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0][1], true);
});
