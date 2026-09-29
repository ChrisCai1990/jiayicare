const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('esbuild')
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<html><body></body></html>')
global.window = dom.window
global.document = dom.window.document
global.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react')
const { createRoot } = require('react-dom/client')
const act = React.act || require('react-dom/test-utils').act

function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '../src', file)
  const module = { exports: {} }
  vm.runInNewContext(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, {
    module, exports: module.exports, console,
    require: name => name in mocks ? mocks[name] : require(name),
  })
  return module.exports
}

async function setup(count) {
  const { plannerOrderRows, isCustomerOrder } = await import('../src/utils/plannerOrderProgress.mjs')
  const orders = Array.from({ length: count }, (_, i) => ({
    _id: `task-${i}`, patientId: { _id: `patient-${i}`, name: `测试会员${i}` },
    sourceOrderId: { _id: `order-${i}`, initiationSource: 'customer', serviceName: `分页服务${i}`, paidAmount: 100 },
  }))
  const history = orders.map((item, i) => ({ ...item, _id: `history-${i}`, completedAt: '2026-09-01', sourceOrderId: { ...item.sourceOrderId, serviceName: `历史服务${i}` } }))
  const navigations = []
  const mocks = {
    'react-router-dom': { useNavigate: () => (...args) => navigations.push(args) },
    '../App': { useStaff: () => ({ staff: { role: 'healthPlanner' } }) },
    '../api': { staffAPI: {
      getReports2: async () => ({ data: {} }), getCheckinOverview: async () => ({ data: [] }),
      getCheckupProgress: async () => ({ data: [] }), getVisitorLeads: async () => ({ data: [] }),
      getFollowUps: async ({ status }) => ({ data: { followUps: status === 'completed' ? history : orders } }),
    } },
    '../components/NotificationSummary': { useNotificationSummary: () => ({ count: 0 }) },
    '../components/Pagination': load('components/Pagination.jsx'),
    '../utils/plannerOrderProgress.mjs': { plannerOrderRows, isCustomerOrder },
  }
  for (const name of ['ConsultationTodosPanel', 'AiTodosPanel', 'SymptomTodosPanel', 'FollowUpsPanel', 'ServiceTasksPanel', 'MonthlyReviewWorkbench']) {
    mocks[`../components/${name}`] = { __esModule: true, default: () => null }
  }
  const Home = load('pages/HomePage.jsx', mocks).default
  const box = document.createElement('div')
  const root = createRoot(box)
  await act(async () => root.render(React.createElement(Home)))
  return { box, navigations, async close() { await act(async () => root.unmount()) } }
}
async function click(scope, label) {
  const button = [...scope.querySelectorAll('button')].find(item => item.textContent === label)
  assert.ok(button, label)
  await act(async () => button.click())
}

test('eight orders render five then three; history pages independently and actions keep their target', async () => {
  const view = await setup(8)
  try {
    const pager = () => view.box.querySelector('nav[aria-label="用户下单服务进程分页"]')
    assert.equal((view.box.textContent.match(/分页服务/g) || []).length, 5)
    assert.ok([...pager().querySelectorAll('button')].find(b => b.textContent === '上一页').disabled)
    await click(pager(), '下一页')
    assert.equal((view.box.textContent.match(/分页服务/g) || []).length, 3)
    assert.ok(view.box.textContent.includes('分页服务7'))
    assert.ok([...pager().querySelectorAll('button')].find(b => b.textContent === '下一页').disabled)
    const row = [...view.box.querySelectorAll('div')].find(el => el.textContent === '分页服务7支付 ¥100.00')
    await act(async () => row.click())
    assert.equal(view.navigations[0][0], '/patients/patient-7?tab=followups')
    assert.equal(view.navigations[0][1].state.openFollowUp._id, 'task-7')
    await click(view.box, '查看已处理预约 8')
    assert.equal((view.box.textContent.match(/历史服务/g) || []).length, 5)
    await click(view.box.querySelector('nav[aria-label="已处理预约分页"]'), '下一页')
    assert.equal((view.box.textContent.match(/历史服务/g) || []).length, 3)
    assert.ok(view.box.textContent.includes('分页服务7'))
    await click(pager(), '上一页')
    assert.ok(view.box.textContent.includes('分页服务0'))
    assert.ok(view.box.textContent.includes('历史服务7'))
  } finally { await view.close() }
})

test('five or fewer orders do not show an unnecessary pager', async () => {
  for (const count of [0, 1, 5]) {
    const view = await setup(count)
    try {
      assert.equal((view.box.textContent.match(/分页服务/g) || []).length, count)
      assert.equal(view.box.querySelector('nav[aria-label="用户下单服务进程分页"]'), null)
    } finally { await view.close() }
  }
})
