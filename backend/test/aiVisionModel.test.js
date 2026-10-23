const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

test('legacy vision requests use the available model in both accounting and provider payload', async () => {
  const source = fs.readFileSync(require.resolve('../src/utils/ai'), 'utf8');
  let accountedModel, payload;
  const https = { request: (_, callback) => {
    const req = new EventEmitter();
    req.write = raw => { payload = JSON.parse(raw); };
    req.end = () => {
      const response = new EventEmitter();
      callback(response);
      process.nextTick(() => {
        response.emit('data', JSON.stringify({ choices: [{ message: { content: '{"items":[]}' } }] }));
        response.emit('end');
      });
    };
    return req;
  } };
  const sandbox = { module: { exports: {} }, process, Buffer, URL, setTimeout, clearTimeout,
    require: name => name === 'https' ? https : name === './aiBudget'
      ? { controlledCall: async (args, send) => { accountedModel = args.model; return send(); } }
      : assert.fail(`Unexpected dependency ${name}`),
  };
  vm.runInNewContext(source, sandbox);
  const previousKey = process.env.QWEN_API_KEY;
  process.env.QWEN_API_KEY = 'synthetic-test-key';
  try {
    for (const legacy of ['qwen-vl-plus', 'qwen-vl-max']) {
      const text = await sandbox.module.exports.parseImage('synthetic-base64', 'Return JSON', { model: legacy });
      assert.equal(text, '{"items":[]}');
      assert.equal(accountedModel, 'qwen3-vl-plus');
      assert.equal(payload.model, 'qwen3-vl-plus');
      assert.equal(payload.enable_thinking, false);
    }
  } finally { if (previousKey === undefined) delete process.env.QWEN_API_KEY; else process.env.QWEN_API_KEY = previousKey; }
});
