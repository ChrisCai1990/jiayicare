const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/aiCaseReviews.js'), 'utf8');

test('legacy sends await their reply while modern sends acknowledge immediately', async () => {
  const start = source.indexOf("router.post('/patients/:patientId/ai-case-reviews/:topicId/messages'");
  const end = source.indexOf("router.patch('/patients/:patientId/ai-case-reviews/:topicId/messages/:messageId'", start);
  let handler, release;
  const topic = { _id: 'topic', generation: { status: 'running' } };
  let current;
  vm.runInNewContext(source.slice(start, end), {
    router: { post(_path, _auth, fn) { handler = fn; } }, staffAuth() {}, ROLE_LABEL: {},
    caseReviewPatientOr404: async () => ({ _id: 'patient' }),
    acceptSend: async () => ({ topic, claimed: true }),
    finishSend: () => new Promise(resolve => { release = resolve; }),
    AiCaseReview: { findOne: async () => current }, forClient: value => value, console,
  });
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const req = { params: { topicId: 'topic' }, staff: { _id: 'staff' }, body: { content: 'question' } };
  const legacy = response(); const pending = handler(req, legacy);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(legacy.body, undefined);
  current = { generation: { status: 'completed' }, messages: [{ role: 'ai', content: 'answer' }] };
  release(); await pending;
  assert.equal(legacy.body.data.messages[0].content, 'answer');
  const failed = response(); const failure = handler(req, failed);
  await new Promise(resolve => setImmediate(resolve));
  current = { generation: { status: 'failed', error: 'timeout' } }; release(); await failure;
  assert.equal(failed.code, 500);
  assert.match(failed.body.message, /提问已保存/);
  const modern = response(); await handler({ ...req, body: { ...req.body, requestId: 'modern-request-123' } }, modern);
  assert.equal(modern.code, 202); assert.equal(modern.body.data, topic); release();
});

test('阶段评估试点开关不再阻断专项研判接口', () => {
  const phaseCalls = source.match(/patientOr404\(req, res\)/g) || [];
  const specialtyBlock = source.slice(source.indexOf("router.get('/patients/:patientId/ai-case-reviews'"));
  assert.equal(phaseCalls.length, 4);
  assert.equal(specialtyBlock.includes('patientOr404(req, res)'), false);
  const routes = [...specialtyBlock.matchAll(/router\.(get|post|patch|delete)\('([^']+)'[\s\S]*?\n\}\);/g)];
  assert.ok(routes.length >= 6, 'original specialty endpoints must remain');
  for (const match of routes) {
    assert.match(match[0], /caseReviewPatientOr404\(req, res\)/, `${match[1]} ${match[2]} must check patient access`);
    assert.doesNotMatch(match[0], /(?<!caseReview)patientOr404\(req, res\)/);
  }
});

test('专病分析模板具有医护读取接口且使用后台模板类型', () => {
  assert.match(source, /router\.get\('\/ai-case-review\/templates'/);
  assert.match(source, /type: 'ai_case_review'/);
});

test('专项研判全部主题由Admin模板提供且保留自定义主题开关', () => {
  const templates = fs.readFileSync(path.join(__dirname, '../src/utils/aiCaseReviewTemplates.js'), 'utf8');
  for (const key of ['checkup', 'nutrition', 'annual', 'medical', 'daily', 'specialty']) assert.match(templates, new RegExp(`'${key}'`));
  assert.match(templates, /allowCustomTopic: true/);
});
