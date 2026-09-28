const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://test.invalid/' });
global.window = dom.window; global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollTo = () => {};
const React = require('react');
const { createRoot } = require('react-dom/client');
const { transformSync } = require('esbuild');
const act = React.act || require('react-dom/test-utils').act;

async function mount(t, initial) {
  const topic = initial || { _id: 'topic', title: 'Synthetic topic', messages: [], contextScopes: [] };
  const state = { topic, calls: [], intervals: new Set(), send: null };
  const api = {
    getAiCaseReviews: async () => ({ data: [state.topic] }),
    getAiCaseReviewTemplates: async () => ({ data: [] }),
    sendAiCaseReviewMessage: async (...args) => { state.calls.push(args); return state.send(...args); },
  };
  const source = fs.readFileSync(path.join(__dirname, '../../staff/src/components/AiCaseReviewPanel.jsx'), 'utf8');
  const context = { module: { exports: {} }, window: dom.window, crypto: require('node:crypto').webcrypto,
    setTimeout: callback => { callback(); return 1; },
    setInterval: callback => { state.intervals.add(callback); return callback; }, clearInterval: callback => state.intervals.delete(callback),
    URLSearchParams, require: name => name === 'react' ? React : { staffAPI: api, API_ORIGIN: '' } };
  vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, context);
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(async () => root.unmount()); container.remove(); });
  await act(async () => root.render(React.createElement(context.module.exports.default,
    { patientId: 'patient', staff: { _id: 'staff', role: 'familyDoctor' }, toast() {}, mode: 'specialty' })));
  const click = async label => {
    const button = [...container.querySelectorAll('button')].find(item => item.textContent.includes(label));
    assert.ok(button, label); await act(async () => button.click());
  };
  await click(topic.title);
  const input = container.querySelector('textarea');
  const type = async value => act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  return { state, container, input, click, type };
}

test('IME and rapid Enter do not duplicate sends; accepted messages render before the AI reply', async t => {
  const { state, container, input, type } = await mount(t);
  let resolve;
  state.send = () => new Promise(done => { resolve = done; });
  await type('synthetic question');
  await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true })));
  assert.equal(state.calls.length, 0);
  await act(async () => {
    input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  assert.equal(state.calls.length, 1);
  const payload = state.calls[0][2];
  state.topic = { ...state.topic, generation: { status: 'running', requestId: payload.requestId, startedAt: new Date() },
    messages: [{ _id: 'question', role: 'staff', staff: 'staff', content: payload.content, requestId: payload.requestId }] };
  await act(async () => resolve({ data: state.topic }));
  assert.equal(input.value, '');
  assert.match(container.textContent, /提问已保存，AI正在回复/);
  assert.match(container.textContent, /synthetic question/);
  state.topic = { ...state.topic, generation: { ...state.topic.generation, status: 'completed' },
    messages: [...state.topic.messages, { _id: 'answer', role: 'ai', content: 'synthetic reply' }] };
  await act(async () => { for (const refresh of state.intervals) await refresh(); });
  assert.match(container.textContent, /synthetic reply/);
  assert.doesNotMatch(container.textContent, /AI正在回复/);
});

test('lost response retains the draft and reuses the same request identity', async t => {
  const { state, input, type, click } = await mount(t);
  state.send = async () => { throw new Error('network disconnected'); };
  await type('same question'); await click('发送给AI');
  assert.equal(input.value, 'same question');
  await click('发送给AI');
  assert.equal(state.calls.length, 2);
  assert.equal(state.calls[0][2].requestId, state.calls[1][2].requestId);
});

test('failed AI reply retries the saved question rather than sending a new one', async t => {
  const requestId = 'existing-request-1234';
  const { state, container, click } = await mount(t, { _id: 'topic', title: 'Synthetic topic', contextScopes: [],
    generation: { status: 'failed', requestId, error: 'synthetic timeout' },
    messages: [{ _id: 'question', role: 'staff', staff: 'staff', content: 'saved question', requestId }] });
  state.send = async () => ({ data: { ...state.topic, generation: { ...state.topic.generation, status: 'running' } } });
  assert.match(container.textContent, /提问已保存，但AI回复失败/);
  await click('重试AI回复');
  assert.equal(state.calls[0][2].requestId, requestId);
  assert.equal(state.calls[0][2].content, 'saved question');
});
