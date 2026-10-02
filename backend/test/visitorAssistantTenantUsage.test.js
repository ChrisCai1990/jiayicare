const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('public assistant tags AI calls and leads with the website owner', async () => {
  const routes = new Map();
  let site = { tenantId: '111111111111111111111111', siteHost: 'jiaycare.com', tenantName: '嘉医汇' };
  let context, calls = 0, lead;
  const router = { post: (route, handler) => routes.set(route, handler) };
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/visitorAssistant.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, process: { env: { QWEN_API_KEY: 'test-only' } }, console: { error() {} },
    require: name => name === 'express' ? { Router: () => router }
      : name === '../utils/ai' ? { chat: async () => { calls++; return '已整理'; } }
      : name === '../utils/aiBudget' ? { withAiContext: (value, fn) => { context = value; return fn(); } }
      : name === '../utils/websiteTenant' ? { resolveWebsiteTenant: async () => { if (!site) throw Object.assign(new Error('网站未绑定'), { status: 403 }); return site; } }
      : name === '../models/VisitorLead' ? { create: async data => { lead = data; return { _id: 'lead' }; } }
      : name === '../utils/visitorAssistantSafety' ? { normalizeText: value => value || '', hasEmergency: () => false, hasMedicalDetail: () => false, emergencyReply: () => '', safeConversation: rows => rows }
      : require(name),
  });
  const invoke = async () => {
    let status = 200, body;
    await routes.get('/reply')({ ip: '127.0.0.1', body: { consent: true, messages: [{ content: '了解健康管理服务' }] } }, { status(code) { status = code; return this; }, json(value) { body = value; return this; } });
    return { status, body };
  };
  assert.equal((await invoke()).status, 200);
  assert.equal(context.tenantId, site.tenantId);
  assert.equal(context.siteHost, 'jiaycare.com');
  assert.equal(context.stage, 'visitor_assistant');
  assert.equal(calls, 1);
  site = { tenantId: '222222222222222222222222', siteHost: 'care.example.com', tenantName: '乙机构' };
  assert.equal((await invoke()).status, 200);
  assert.equal(context.tenantId, site.tenantId);
  assert.equal(context.siteHost, 'care.example.com');
  let result;
  await routes.get('/handoff')({ body: { consent: true, name: '测试', phone: '13800000000', topic: '健康管理' } }, { status(code) { this.code = code; return this; }, json(value) { result = value; return this; } });
  assert.equal(lead.tenantId, site.tenantId);
  assert.equal(lead.siteHost, site.siteHost);
  assert.match(result.message, /乙机构/);
  site = null;
  assert.equal((await invoke()).status, 403);
  assert.equal(calls, 2);
});
