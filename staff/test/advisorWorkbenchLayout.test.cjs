const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('esbuild')
const { JSDOM } = require('jsdom')
const React = require('react')
const { createRoot } = require('react-dom/client')
const act = React.act || require('react-dom/test-utils').act

const dom = new JSDOM('<html><body></body></html>')
global.window = dom.window
global.document = dom.window.document
global.IS_REACT_ACT_ENVIRONMENT = true

function panel(name) {
  return props => React.createElement('div', { 'data-panel': name, 'data-task-mode': String(!!props.taskMode) }, name)
}

async function mount(role) {
  const mocks = {
    'react-router-dom': { useNavigate: () => () => {}, useLocation: () => ({ search: '' }) },
    '../App': { useStaff: () => ({ staff: { role, name: '测试人员' } }) },
    '../api': { getToken: () => 'test', staffAPI: {
      getReports2: async () => ({ data: {} }),
      getCheckinOverview: async () => ({ data: [] }),
    } },
    '../hooks/useWorkbenchResource': () => ({ data: { pending: [], completed: [] }, loading: false, error: '', refresh() {} }),
    '../utils/loadFollowUpPages.mjs': { loadFollowUpPages: async () => [] },
    '../components/NotificationSummary': { useNotificationSummary: () => ({ count: 0, data: {} }) },
    '../components/AiWorkbenchProvider': { __esModule: true, default: ({ children }) => children },
    '../utils/plannerOrderProgress.mjs': { plannerOrderRows: () => [], isCustomerOrder: () => false, decisionReferralProgress: () => '' },
    '../utils/serviceTaskTitle.mjs': { serviceTaskTitle: () => '' },
    '../utils/medicalPlanningAdvice': { planningAdviceFromTask: () => null, hasPlanningAdvice: () => false },
    '../../../shared/orderShipping.cjs': { shippingProgress: () => '' },
  }
  for (const name of [
    'GeoReviewPanel', 'CheckupProgressPanel', 'ConsultationTodosPanel', 'OrderShipmentsPanel', 'InventoryDispatchPanel',
    'AiTodosPanel', 'ClinicalStandardReviewPanel', 'SymptomTodosPanel', 'FollowUpsPanel',
    'ServiceTasksPanel', 'MedicalAssistClosureAction', 'ServiceSupervisionPanel',
    'MedicalAssistProgressPanel', 'MonthlyReviewWorkbench', 'NutritionAssessmentPanel', 'Pagination',
  ]) mocks['../components/' + name] = { __esModule: true, default: panel(name) }
  mocks['../components/GeoReviewPanel'] = { __esModule: true, canShowGeoReview: actor => actor.role === 'familyDoctor', default: props => React.createElement('div', { 'data-panel': 'GeoReviewPanel', 'data-compact': String(props.compact) }, React.createElement('button', { onClick: props.onOpen }, '进入 GEO 审核')) }
  const filename = path.resolve(__dirname, '../src/pages/HomePage.jsx')
  const module = { exports: {} }
  vm.runInNewContext(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, {
    module, exports: module.exports, console, window, document, URLSearchParams,
    require: name => name in mocks ? mocks[name] : require(name),
  })
  const box = document.createElement('div')
  const root = createRoot(box)
  await act(async () => root.render(React.createElement(module.exports.default)))
  return { box, async click(label) {
    const button = [...box.querySelectorAll('button')].find(item => item.textContent === label)
    assert.ok(button, label)
    await act(async () => button.click())
  }, visible(name) {
    const item = box.querySelector('[data-panel="' + name + '"]')
    assert.ok(item, name)
    return !item.closest('[style*="display: none"]')
  }, async close() { await act(async () => root.unmount()) } }
}

test('health consultant can switch between tasks, service progress, and data without losing task panels', async () => {
  const view = await mount('familyDoctor')
  try {
    assert.ok(view.box.querySelector('nav[aria-label="健康顾问工作台"]'))
    assert.equal(view.visible('AiTodosPanel'), true)
    assert.equal(view.visible('ServiceTasksPanel'), false)
    assert.equal(view.visible('FollowUpsPanel'), false)
    assert.equal(view.box.querySelector('[data-panel="GeoReviewPanel"]').dataset.compact, 'true')
    await view.click('进入 GEO 审核')
    assert.equal(view.box.querySelector('[data-panel="GeoReviewPanel"]').dataset.compact, 'false')
    assert.equal(view.visible('AiTodosPanel'), false)
    await view.click('服务事项')
    assert.equal(view.visible('ServiceTasksPanel'), true)
    assert.equal(view.visible('MonthlyReviewWorkbench'), true)
    await view.click('随访')
    assert.equal(view.visible('FollowUpsPanel'), true)
    await view.click('我关注的服务')
    assert.equal(view.visible('ServiceSupervisionPanel'), true)
    assert.equal(view.visible('AiTodosPanel'), false)
    await view.click('就医协助')
    assert.equal(view.visible('MedicalAssistProgressPanel'), true)
    await view.click('体检方案')
    assert.equal(view.visible('CheckupProgressPanel'), true)
    await view.click('数据概览')
    assert.equal(view.visible('GeoReviewPanel'), true)
    assert.equal(view.box.querySelector('[data-panel="GeoReviewPanel"]').dataset.compact, 'true')
    assert.match(view.box.textContent, /今日健康数据记录/)
  } finally { await view.close() }
})

for (const role of ['healthPlanner', 'healthManager', 'nutritionist', 'medicalAssistant', 'specialist', 'psychologist', 'rehabSpecialist', 'tcmDoctor', 'superadmin']) {
  test(`${role} starts with assigned work and keeps service progress in its task area`, async () => {
    const view = await mount(role)
    try {
      assert.ok(view.box.querySelector('nav[aria-label="岗位工作台"]'))
      assert.equal(view.visible('ServiceTasksPanel'), true)
      assert.equal(view.visible('AiTodosPanel'), true)
      assert.equal(view.visible('FollowUpsPanel'), true)
      await view.click('审核与异常')
      assert.equal(view.visible('AiTodosPanel'), true)
      assert.equal(view.visible('ServiceTasksPanel'), false)
      await view.click('服务事项')
      assert.equal(view.visible('ServiceTasksPanel'), true)
      assert.equal(view.visible('ServiceSupervisionPanel'), true)
      assert.equal(view.visible('FollowUpsPanel'), false)
      if (role === 'healthManager') {
        assert.equal(view.visible('CheckupProgressPanel'), false)
        assert.equal(view.visible('NutritionAssessmentPanel'), false)
        await view.click('体检服务')
        assert.equal(view.visible('CheckupProgressPanel'), true)
        assert.equal(view.box.querySelector('[data-panel="CheckupProgressPanel"]').dataset.taskMode, 'true')
        await view.click('预约服务')
        assert.equal(view.visible('NutritionAssessmentPanel'), true)
        assert.equal(view.visible('CheckupProgressPanel'), false)
      }
      if (role === 'superadmin') {
        assert.equal(view.visible('CheckupProgressPanel'), true)
        assert.equal(view.box.querySelector('[data-panel="CheckupProgressPanel"]').dataset.taskMode, 'true')
      }
      assert.equal([...view.box.querySelectorAll('button')].some(button => button.textContent === '我关注的服务'), false)
      await view.click('数据概览')
      assert.match(view.box.textContent, /今日健康数据记录/)
      assert.equal(view.visible('ServiceTasksPanel'), false)
    } finally { await view.close() }
  })
}
