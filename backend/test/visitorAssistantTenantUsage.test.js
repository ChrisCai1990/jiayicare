const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('public Jiayihui assistant tags AI calls with the institution tenant', async () => {
  const routes = new Map();
  const tenantId = '111111111111111111111111';
  let context, calls = 0, tenantAvailable = true;
  const router = { post: (route, handler) => routes.set(route, handler) };
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/visitorAssistant.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, process: { env: { QWEN_API_KEY: 'test-only' } }, console: { error() {} },
    require: name => name === 'express' ? { Router: () => router }
      : name === '../utils/ai' ? { chat: async () => { calls++; return '已整理'; } }
      : name === '../utils/aiBudget' ? { withAiContext: (value, fn) => { context = value; return fn(); } }
      : name === '../models/Tenant' ? { findOne: () => ({ select: () => ({ lean: async () => tenantAvailable ? { _id: tenantId } : null }) }) }
      : name === '../models/VisitorLead' ? {}
      : name === '../utils/visitorAssistantSafety' ? { normalizeText: value => value || '', hasEmergency: () => false, hasMedicalDetail: () => false, emergencyReply: () => '', safeConversation: rows => rows }
      : require(name),
  });
  const invoke = async () => {
    let status = 200, body;
    await routes.get('/reply')({ ip: '127.0.0.1', body: { consent: true, messages: [{ content: '了解健康管理服务' }] } }, { status(code) { status = code; return this; }, json(value) { body = value; return this; } });
    return { status, body };
  };
  assert.equal((await invoke()).status, 200);
  assert.equal(context.tenantId, tenantId);
  assert.equal(context.stage, 'visitor_assistant');
  assert.equal(calls, 1);
  tenantAvailable = false;
  assert.equal((await invoke()).status, 503);
  assert.equal(calls, 1);
});
