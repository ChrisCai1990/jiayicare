const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const { transformSync } = require('esbuild')
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react'), { createRoot } = require('react-dom/client')
const act = React.act || require('react-dom/test-utils').act
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '../src', file), module = { exports: {} }
  vm.runInNewContext(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, {
    module, exports: module.exports, console, window, document,
    require: name => name in mocks ? mocks[name] : name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(filename), name + (path.extname(name) ? '' : '.js'))), mocks) : require(name),
  })
  return module.exports
}
async function mount(element) {
  const box = document.createElement('div'), root = createRoot(box)
  await act(async () => root.render(element))
  return { box, root, async close() { await act(async () => root.unmount()) } }
}
async function click(box, label) { const button = [...box.querySelectorAll('button')].find(b => b.textContent.includes(label)); assert.ok(button, label); await act(async () => button.click()) }
const hook = load('hooks/useWorkbenchResource.js').default
const mocksFor = api => ({ '../api': { staffAPI: api, getToken: () => 'test' }, '../App': { useStaff: () => ({ staff: { role: 'familyDoctor' } }) }, 'react-router-dom': { useNavigate: () => () => {} }, '../hooks/useWorkbenchResource': { default: hook, __esModule: true } })
test('monthly review errors remain visible and explicit retry recovers', async () => {
  let fail = true
  const Component = load('components/MonthlyReviewWorkbench.jsx', mocksFor({ getMonthlyReviewWorkbench: async () => {
    if (fail) throw new Error('测试失败'); return { data: { pending: [{ annualPlanId: 'p', month: '2026-09', patientName: '复盘客户' }], actions: [] } }
  } })).default
  const view = await mount(React.createElement(Component))
  try { assert.match(view.box.textContent, /加载失败/); assert.ok(view.box.querySelector('[role="alert"]')); fail = false; await click(view.box, '重试'); assert.match(view.box.textContent, /复盘客户/); assert.ok(!view.box.querySelector('[role="alert"]')) }
  finally { await view.close() }
})
test('AI and symptom consumers share one query; failures never display an empty success', async () => {
  let calls = 0, fail = true
  const mocks = mocksFor({ getAiTodos: async () => { calls++; if (fail) throw new Error('暂不可用'); return { data: [{ id: 'symptom_1', type: 'symptom_review', patientName: '新增不适', link: '/patient/1' }] } } })
  const provider = load('components/AiWorkbenchProvider.jsx', mocks)
  mocks['./AiWorkbenchProvider'] = provider
  const Symptoms = load('components/SymptomTodosPanel.jsx', mocks).default
  function OtherConsumer() { const value = provider.useAiWorkbench(); return React.createElement('span', null, value.data.length) }
  const view = await mount(React.createElement(provider.default, null, React.createElement(Symptoms), React.createElement(OtherConsumer)))
  try {
    assert.equal(calls, 1); assert.match(view.box.textContent, /加载失败/); assert.doesNotMatch(view.box.textContent, /暂无待处理/)
    fail = false; await act(async () => window.dispatchEvent(new window.Event('focus')))
    assert.equal(calls, 2); assert.match(view.box.textContent, /新增不适/)
  } finally { await view.close() }
})
test('resource coalesces focus refresh and discards old query responses', async () => {
  const pending = [], calls = []
  function Component({ query }) {
    const value = hook(() => new Promise(resolve => { calls.push(query); pending.push(resolve) }), query, [])
    return React.createElement('span', null, value.data.join(','))
  }
  const view = await mount(React.createElement(Component, { query: 'old' }))
  try {
    await act(async () => { window.dispatchEvent(new window.Event('focus')); window.dispatchEvent(new window.Event('focus')) })
    assert.deepEqual(calls, ['old'])
    await act(async () => view.root.render(React.createElement(Component, { query: 'new' })))
    await act(async () => pending[1](['新队列']))
    await act(async () => pending[0](['旧队列']))
    assert.equal(view.box.textContent, '新队列')
  } finally { await view.close() }
})
test('follow-up component pages server results and shows active state labels', async () => {
  const calls = []
  const mocks = mocksFor({ getFollowUps: async params => {
    calls.push(params); return { data: { page: params.page, total: 214, followUps: [{ _id: 'task' + params.page, theme: '第' + params.page + '页', status: 'missed', date: '2026-09-28', patientId: {} }], workbenchSummary: { counts: { all: 214, overdue: 214 }, waiting: 1 } } }
  } })
  mocks['../utils/date'] = { formatChineseDate: v => v }
  mocks['./Pagination'] = load('components/Pagination.jsx')
  const Component = load('components/FollowUpsPanel.jsx', mocks).default
  const view = await mount(React.createElement(Component))
  try { assert.match(view.box.textContent, /214/); assert.match(view.box.textContent, /已错过，待跟进/); await click(view.box, '下一页'); assert.equal(calls.at(-1).page, 2); assert.match(view.box.textContent, /第2页/) }
  finally { await view.close() }
})
test('a failure on later order pages rejects the incomplete snapshot', async () => {
  const { loadFollowUpPages } = await import('../src/utils/loadFollowUpPages.mjs')
  await assert.rejects(loadFollowUpPages(async ({ page }) => {
    if (page === 2) throw new Error('第二页失败')
    return { data: { followUps: [{ _id: 'first' }], total: 101, page, limit: 100 } }
  }, {}), /第二页失败/)
})


test('a refresh started before completion cannot resurrect the completed item', async () => {
  let resource, finishOld, calls = 0;
  function Component() {
    resource = hook(async () => {
      calls++;
      if (calls === 1) return ['任务'];
      if (calls === 2) return new Promise(resolve => { finishOld = resolve; });
      return [];
    }, 'completion', []);
    return React.createElement('span', null, resource.data.join(','));
  }
  const view = await mount(React.createElement(Component));
  try {
    await act(async () => { window.dispatchEvent(new window.Event('focus')); });
    await act(async () => resource.setData([]));
    await act(async () => finishOld(['任务']));
    assert.equal(view.box.textContent, ''); assert.equal(calls, 3);
  } finally { await view.close(); }
});
