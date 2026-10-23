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

test('medical assistance detail opens the full process without navigating to follow-ups', async () => {
  const dom = new JSDOM('<html><body></body></html>')
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  const navigations = []
  const mocks = {
    'react-router-dom': { useNavigate: () => target => navigations.push(target) },
    './Pagination': { default: () => null },
    '../api': { staffAPI: { getMedicalAssistProgress: async () => ({ data: [{
      id: 'order:1', patientId: 'patient', patientName: '测试客户', title: '陪同看诊服务',
      source: 'order', supervisorName: '规划师', stage: '陪同看诊', waitingReason: '等待处理',
      stages: [
        { id: 'a', label: '核对资料', status: 'completed', assignee: '健管专员' },
        { id: 'b', label: '陪同看诊', status: 'in_progress', assignee: '就医专员' },
      ],
    }] }) } },
  }
  const filename = path.resolve(__dirname, '../src/components/MedicalAssistProgressPanel.jsx')
  const module = { exports: {} }
  vm.runInNewContext(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, {
    module, exports: module.exports, console, window, document,
    require: name => name in mocks ? mocks[name] : require(name),
  })
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(async () => root.render(React.createElement(module.exports.default)))
    const button = [...container.querySelectorAll('button')].find(node => node.textContent === '查看完整进程')
    assert.ok(button)
    await act(async () => button.click())
    assert.match(container.textContent, /核对资料.*已完成.*陪同看诊.*进行中/)
    assert.deepEqual(navigations, [])
    const archive = [...container.querySelectorAll('button')].find(node => node.textContent === '查看客户就医服务档案')
    await act(async () => archive.click())
    assert.deepEqual(navigations, ['/patients/patient?tab=plans&serviceView=medical'])
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
  }
})
