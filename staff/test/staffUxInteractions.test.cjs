const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('esbuild')
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
global.window = dom.window
global.document = dom.window.document
global.navigator = dom.window.navigator
global.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react')
const { createRoot } = require('react-dom/client')
const act = React.act || require('react-dom/test-utils').act
const { MemoryRouter } = require('react-router-dom')

function load(relative, mocks, suffix = '') {
  const filename = path.resolve(__dirname, '../src', relative)
  const code = transformSync(fs.readFileSync(filename, 'utf8') + suffix, { loader: 'jsx', format: 'cjs' }).code
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: name => name in mocks ? mocks[name] : name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(filename), name + (path.extname(name) ? '' : '.js'))), mocks) : require(name),
    window, document, console, setTimeout, clearTimeout, setInterval, clearInterval, Event: window.Event,
  }, { filename })
  return module.exports
}
async function mount(element) {
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(element))
  return { container, async close() { await act(async () => root.unmount()); container.remove() } }
}
const settle = (ms = 20) => act(async () => new Promise(resolve => setTimeout(resolve, ms)))
async function click(container, text) {
  const button = [...container.querySelectorAll('button')].find(b => b.textContent.includes(text))
  assert.ok(button, `missing button ${text}`)
  await act(async () => button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
}
async function input(container, value) {
  const field = container.querySelector('input')
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(field, value)
    field.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

test('patient picker pages server results, finds members beyond the old limit and preserves selection', async () => {
  const calls = []
  const api = { getPatients: async params => {
    calls.push(params)
    return { data: { total: params.search ? 1 : 250, patients: [{ _id: params.search ? 'member-250' : `page-${params.page}`, name: params.search ? '虚构远端会员' : `测试页${params.page}`, phone: '' }] } }
  } }
  const Picker = load('components/PatientPicker.jsx', { '../api': { staffAPI: api } }).default
  let selected
  function Harness() { const [value, setValue] = React.useState(''); return React.createElement(Picker, { value, onChange: id => { selected = id; setValue(id) } }) }
  const view = await mount(React.createElement(Harness))
  try {
    await settle(); await click(view.container, '下一页会员'); await settle()
    assert.equal(calls.at(-1).page, 2)
    await input(view.container, '远端'); await settle(350)
    assert.equal(calls.at(-1).search, '远端'); assert.equal(calls.at(-1).page, 1)
    await click(view.container, '虚构远端会员')
    assert.equal(selected, 'member-250'); assert.match(view.container.textContent, /已选：虚构远端会员/)
    await click(view.container, '重新选择会员'); assert.equal(selected, '')
  } finally { await view.close() }
})

test('late search results cannot overwrite a newer query and failures offer retry', async () => {
  let finishOld; let fail = true
  const api = { getPatients: ({ search }) => {
    if (search === '旧') return new Promise(resolve => { finishOld = resolve })
    if (search === '失败' && fail) return Promise.reject(new Error('测试断网'))
    return Promise.resolve({ data: { total: 1, patients: [{ _id: search || 'first', name: search || '首页会员' }] } })
  } }
  const Picker = load('components/PatientPicker.jsx', { '../api': { staffAPI: api } }).default
  const view = await mount(React.createElement(Picker, { value: '', onChange() {} }))
  try {
    await settle(); await input(view.container, '旧'); await settle(350)
    await input(view.container, '新'); await settle(350)
    await act(async () => finishOld({ data: { total: 1, patients: [{ _id: 'old', name: '旧结果不能显示' }] } }))
    assert.doesNotMatch(view.container.textContent, /旧结果不能显示/)
    await input(view.container, '失败'); await settle(350)
    assert.match(view.container.textContent, /测试断网/)
    fail = false; await click(view.container, '重试'); await settle(350)
    assert.doesNotMatch(view.container.textContent, /测试断网/)
  } finally { await view.close() }
})

test('home and sidebar consumers share count and refresh, retaining prior value on failure', async () => {
  let count = 13; let fail = false; let calls = 0
  const { NotificationSummaryProvider, useNotificationSummary } = load('components/NotificationSummary.jsx', {
    '../api': { staffAPI: { getNotifications: async () => { calls++; if (fail) throw Error('测试通知失败'); return { data: { summary: { unreadMessageCount: count } } } } } },
  })
  function Consumer() { const s = useNotificationSummary(); return React.createElement('output', null, `${s.count ?? 'loading'}:${s.error}`) }
  const view = await mount(React.createElement(MemoryRouter, null, React.createElement(NotificationSummaryProvider, null, React.createElement(Consumer), React.createElement(Consumer))))
  try {
    assert.deepEqual([...view.container.querySelectorAll('output')].map(e => e.textContent), ['13:', '13:'])
    assert.equal(calls, 1)
    count = 5; await act(async () => window.dispatchEvent(new window.Event('notif-refresh')))
    assert.deepEqual([...view.container.querySelectorAll('output')].map(e => e.textContent), ['5:', '5:'])
    fail = true; await act(async () => window.dispatchEvent(new window.Event('notif-refresh')))
    assert.ok([...view.container.querySelectorAll('output')].every(e => e.textContent === '5:测试通知失败'))
  } finally { await view.close() }
})

for (const [file, component, prop, method] of [
  ['KnowledgePage.jsx', 'PushModal', 'item', 'pushKnowledge'],
  ['QuestionnairePushPage.jsx', 'PushQuestionnaireModal', 'questionnaire', 'pushQuestionnaire'],
  ['ProductPushPage.jsx', 'PatientSelectModal', 'item', 'pushBundle'],
]) test(`${component}: failed push stays open and never invokes success`, async () => {
  let saved = 0
  const api = { getPatients: async () => ({ data: { total: 1, patients: [{ _id: 'fixture', name: '虚构会员' }] } }), [method]: async () => { throw Error('模拟推送失败') } }
  const picker = load('components/PatientPicker.jsx', { '../api': { staffAPI: api } })
  const mocks = { '../api': { staffAPI: api }, '../App': { useToast: () => () => {} }, '../components/PatientPicker': picker }
  const Component = load(`pages/${file}`, mocks, `\nexport { ${component} };`)[component]
  const view = await mount(React.createElement(Component, { [prop]: { _id: 'test', title: '测试模板' }, patients: [], selectedItems: [], totalPrice: 0, onClose() {}, onSaved() { saved++ } }))
  try {
    await settle(); await click(view.container, '选择本页'); await click(view.container, '推送给 1')
    assert.equal(saved, 0); assert.match(view.container.textContent, /模拟推送失败/)
    assert.match(view.container.textContent, /已选 1/)
  } finally { await view.close() }
})

test('multi-member selection survives page changes and selecting a second page', async () => {
  const api = { getPatients: async ({ page }) => ({ data: { total: 25, patients: [{ _id: `member-${page}`, name: `虚构会员${page}` }] } }) }
  const picker = load('components/PatientPicker.jsx', { '../api': { staffAPI: api } })
  const Component = load('pages/KnowledgePage.jsx', { '../api': { staffAPI: api }, '../App': { useToast: () => () => {} }, '../components/PatientPicker': picker }, '\nexport { PushModal };').PushModal
  const view = await mount(React.createElement(Component, { item: { title: '测试' }, onClose() {}, onSaved() {} }))
  try {
    await settle(); await click(view.container, '选择本页'); await click(view.container, '下一页会员'); await settle(); await click(view.container, '选择本页')
    assert.match(view.container.textContent, /已选 2 人/)
    await click(view.container, '上一页会员'); await settle(); await click(view.container, '选择本页')
    assert.match(view.container.textContent, /已选 2 人/)
  } finally { await view.close() }
})

test('upload report ignores plan items from a previously selected member', async () => {
  let finishA
  const api = {
    getPatients: async () => ({ data: { total: 2, patients: [{ _id: 'A', name: '虚构甲' }, { _id: 'B', name: '虚构乙' }] } }),
    getActivePlanItems: id => id === 'A' ? new Promise(resolve => { finishA = resolve }) : Promise.resolve({ data: [{ planId: 'b', itemId: 'b-item', itemName: '乙的检查', planTitle: '乙方案' }] }),
  }
  const picker = load('components/PatientPicker.jsx', { '../api': { staffAPI: api } })
  const Component = load('pages/ReportsPage.jsx', {
    '../api': { staffAPI: api }, '../App': { useToast: () => () => {}, usePermission: () => () => true },
    '../components/PatientPicker': picker, '../components/Pagination': () => null,
    '../components/ReportReviewQuality': { useReportReviewActivity: () => ({ current() {} }) },
  }, '\nexport { UploadModal };').UploadModal
  const view = await mount(React.createElement(Component, { onClose() {}, onSaved() {} }))
  try {
    await settle(); await click(view.container, '虚构甲'); await click(view.container, '重新选择会员'); await click(view.container, '虚构乙')
    await act(async () => finishA({ data: [{ planId: 'a', itemId: 'a-item', itemName: '甲的检查不能出现' }] }))
    assert.match(view.container.textContent, /乙的检查/)
    assert.doesNotMatch(view.container.textContent, /甲的检查不能出现/)
  } finally { await view.close() }
})

test('report list ignores the slow response from the previous filter', async () => {
  let finishOld
  const api = { getReports: ({ status }) => status ? Promise.resolve({ data: { total: 1, reports: [{ _id: 'new', title: '当前筛选报告', audit_status: 'audited', user: { name: '虚构会员' } }] } }) : new Promise(resolve => { finishOld = resolve }) }
  const Component = load('pages/ReportsPage.jsx', {
    '../api': { staffAPI: api }, '../App': { useToast: () => () => {}, usePermission: () => () => true },
    '../components/PatientPicker': () => null, '../components/Pagination': () => null,
    '../components/ReportReviewQuality': { useReportReviewActivity: () => ({ current() {} }) },
  }).default
  const view = await mount(React.createElement(Component))
  try {
    await click(view.container, '待审核')
    await act(async () => finishOld({ data: { total: 0, reports: [] } }))
    assert.match(view.container.textContent, /当前筛选报告/)
    assert.match(view.container.textContent, /共 1 份报告/)
  } finally { await view.close() }
})
