const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const { transformSync } = require('esbuild')
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react'), { createRoot } = require('react-dom/client')
const act = React.act || require('react-dom/test-utils').act
function loader(mocks) {
  const cache = new Map()
  const load = filename => {
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }; cache.set(filename, module)
    vm.runInNewContext(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, {
      module, exports: module.exports, console, window, document, URLSearchParams,
      require: name => {
        if (name in mocks) return mocks[name]
        if (!name.startsWith('.')) return require(name)
        const base = path.resolve(path.dirname(filename), name)
        const target = [base, base + '.js', base + '.jsx'].find(f => fs.existsSync(f) && fs.statSync(f).isFile())
        return load(target)
      },
    })
    return module.exports
  }
  return file => load(path.resolve(__dirname, '../src', file))
}

test('sidebar reminder works away from home, survives viewing, follows completion and preserves failures', async () => {
  let role = 'specialist', token = 'expert', location = { pathname: '/profile', search: '' }
  let todos = [{ id: 'expert-case', type: 'expert_consultation_task' }], followups = 0, fail = false
  const empty = async () => ({ data: [] })
  const api = { getAiTodos: async () => { if (fail) throw Error('offline'); return { data: todos } },
    getFollowUps: async () => ({ data: { followUps: [], total: 0, workbenchSummary: { counts: { all: followups } } } }),
    getServiceTasks: empty, getMonthlyReviewWorkbench: async () => ({ data: { pending: [], actions: [] } }),
    getServiceSupervision: async () => ({ data: { inbox: [], services: [] } }),
    clinicalStandardUpdates: empty, inventoryDispatches: empty, getCheckupProgress: empty,
    getConsultationTodos: empty, getOrderShipments: empty, getNutritionAssessments: empty }
  const mocks = {
    '../api': { staffAPI: api, getToken: () => token },
    '../App': { useStaff: () => ({ staff: { _id: token, role, name: '测试' }, logout() {} }) },
    'react-router-dom': { Outlet: () => null, useNavigate: () => p => { location = { pathname: p.split('?')[0], search: '?' + p.split('?')[1] } }, useLocation: () => location },
    './NotificationSummary': { NotificationSummaryProvider: ({ children }) => children, useNotificationSummary: () => ({ count: 0 }) },
    './AppIcon': () => null,
    '../setupNav': { getSetupNav: () => [] }, '../modulePermission': { hasModulePermission: () => true },
    './GeoReviewPanel': { canShowGeoReview: () => false },
  }
  const Layout = loader(mocks)('components/Layout.jsx').default
  const box = document.createElement('div'), root = createRoot(box)
  const render = async () => act(async () => root.render(React.createElement(Layout)))
  const refresh = async () => act(async () => window.dispatchEvent(new window.Event('notif-refresh')))
  const dot = () => box.querySelector('nav .sidebar-workbench-dot')
  try {
    await render()
    assert.ok(dot()); assert.equal(dot().getAttribute('aria-label'), '有待处理任务')
    assert.ok(box.querySelector('.mobile-menu-btn .sidebar-workbench-dot'))
    await act(async () => [...box.querySelectorAll('nav button')].find(b => b.textContent === '工作台').click())
    await render(); assert.equal(location.pathname, '/home'); assert.ok(dot(), 'viewing must not clear task')
    fail = true; await refresh(); assert.ok(dot()); assert.match(dot().title, /更新失败/)
    fail = false; todos = []; await refresh(); assert.equal(dot(), null, 'completed expert task clears badge')
    role = 'healthManager'; token = 'manager'; followups = 1; await render()
    assert.ok(dot(), 'non-AI pending followup must also light sidebar')
    followups = 0; await refresh(); assert.equal(dot(), null)
    role = 'familyDoctor'; token = 'advisor'; todos = [{ id: 'advisor-case', type: 'expert_consultation_task' }]; await render(); assert.ok(dot())
    role = 'specialist'; token = 'different-expert'; todos = []; await render(); assert.equal(dot(), null, 'account switch cannot inherit another person’s task')
    fail = true; await refresh(); assert.ok(dot().classList.contains('is-unknown'), 'first failure is unknown, not empty')
  } finally { await act(async () => root.unmount()) }
})

test('service and nutrition reminder rules agree with actionable work, excluding future and blocked progress', async () => {
  const { groupServiceTasks, isServiceActionable, isNutritionActionable, mergeReminderResults, reminderState } = await import('../src/utils/workbenchReminder.mjs')
  const now = new Date('2026-11-03T12:00:00+08:00')
  const base = { _id: 'a', sourceType: 'order', sourceOrderId: 'order1', status: 'planned', date: '2026-11-03T10:00:00+08:00' }
  const groups = groupServiceTasks([{ ...base, taskRole: 'supervisor' }, { ...base, _id: 'b', taskRole: 'executor' }])
  assert.equal(groups.length, 1); assert.equal(groups[0].task._id, 'b'); assert.equal(isServiceActionable(groups[0], now), true)
  assert.equal(isServiceActionable({ task: { ...base, taskRole: 'executor', isBlocked: true } }, now), false)
  assert.equal(isServiceActionable({ task: { ...base, taskRole: 'executor', date: '2026-11-10' } }, now), false)
  assert.equal(isServiceActionable({ task: { ...base, taskRole: 'supervisor' } }, now), false)
  assert.equal(isNutritionActionable({ status: 'awaiting_booking' }, 'healthManager'), true)
  assert.equal(isNutritionActionable({ status: 'awaiting_booking' }, 'nutritionist'), false)
  assert.equal(isNutritionActionable({ status: 'booked' }, 'nutritionist'), true)
  assert.equal(isNutritionActionable({ status: 'completed' }, 'nutritionist'), false)
  const snapshot = mergeReminderResults({ a: { pending: true } }, [['a'], ['b']], [{ status: 'rejected' }, { status: 'fulfilled', value: false }])
  assert.deepEqual(reminderState(snapshot), { pending: true, error: true })
})
