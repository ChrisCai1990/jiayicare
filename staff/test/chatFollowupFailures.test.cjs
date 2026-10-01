const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { transformSync } = require('esbuild'), { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { url: 'http://localhost' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'), { createRoot } = require('react-dom/client'), act = React.act || require('react-dom/test-utils').act;
const base = { id: 'chat_failure_p_nutritionist', type: 'chat_followup_failed', patientId: 'p', patientName: '合成会员', label: '营养聊天草稿需处理', summary: '合成失败', jobToken: 'v1', canResolve: true, createdAt: new Date(), link: '/patients/p?tab=serviceRecords' };
async function mount(rows) {
  let todos = rows, calls = [], alerts = [];
  window.confirm = () => true; window.prompt = () => '已人工整理记录'; window.alert = text => alerts.push(text);
  const api = { generateChatFollowupDraft: async (...args) => { calls.push(['retry', ...args]); }, resolveChatFollowupFailure: async (...args) => { calls.push(['resolve', ...args]); } };
  const deps = {
    react: React, 'react-router-dom': { useNavigate: () => () => {} }, '../api': { staffAPI: api }, '../App': { useStaff: () => ({ staff: { role: 'nutritionist' } }) },
    './AiWorkbenchProvider': { useAiWorkbench: () => ({ data: todos, setData: fn => { todos = fn(todos); }, loading: false, refresh: async () => { todos = []; } }) },
    '../utils/staffWorkspace': { filterReviewTodos: rows => rows }, './Pagination': () => null, './SupplyWorkflowModal': () => null, './CheckupHandoffTodoModal': () => null,
  };
  const m = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync(require.resolve('../src/components/AiTodosPanel.jsx'), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, { module: m, exports: m.exports, require: n => deps[n], window, document });
  const el = document.createElement('div'); document.body.append(el); const root = createRoot(el);
  await act(async () => root.render(React.createElement(m.exports.default)));
  return { el, api, calls, alerts, close: async () => { await act(async () => root.unmount()); el.remove(); } };
}
test('failure has explicit retry and actual-handling actions; normal/uncertain states do not', async () => {
  for (const rows of [[], [{ ...base, canResolve: false }]]) {
    const h = await mount(rows); try { assert.equal([...h.el.querySelectorAll('button')].some(b => b.textContent === '重试生成'), false); } finally { await h.close(); }
  }
});
test('retry submits one nutrition request and refreshes existing workbench', async () => {
  const h = await mount([base]); try {
    await act(async () => [...h.el.querySelectorAll('button')].find(b => b.textContent === '重试生成').click());
    assert.deepEqual(h.calls, [['retry', 'p', 'nutritionist', 'week', 'v1']]); assert.doesNotMatch(h.el.textContent, /合成会员/);
  } finally { await h.close(); }
});
test('manual completion requires actual note and sends the displayed version token', async () => {
  const h = await mount([base]); try {
    window.prompt = () => ' ';
    await act(async () => [...h.el.querySelectorAll('button')].find(b => b.textContent === '已人工处理').click()); assert.equal(h.calls.length, 0);
    window.prompt = () => '已人工整理记录';
    await act(async () => [...h.el.querySelectorAll('button')].find(b => b.textContent === '已人工处理').click());
    assert.deepEqual(h.calls, [['resolve', 'p', 'v1', '已人工整理记录']]);
  } finally { await h.close(); }
});
test('failed retry is visible instead of silently claiming completion', async () => {
  const h = await mount([base]); try {
    h.api.generateChatFollowupDraft = async () => { throw new Error('合成失败信息'); };
    await act(async () => [...h.el.querySelectorAll('button')].find(b => b.textContent === '重试生成').click());
    assert.deepEqual(h.alerts, ['合成失败信息']);
  } finally { await h.close(); }
});
