const { test } = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const { buildSync } = require('esbuild')
const path = require('node:path')
const Module = require('node:module')

test('typing, correction, clear and calendar selection preserve the controlled date', async () => {
  const dom = new JSDOM('<div id="root"></div>')
  global.window = dom.window
  global.document = dom.window.document
  global.HTMLElement = dom.window.HTMLElement
  global.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const fireChange = (element, value) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new window.Event('input', { bubbles: true })); element.dispatchEvent(new window.Event('change', { bubbles: true })) }
  const filename = path.resolve(__dirname, '../src/components/DateInput.jsx')
  const output = buildSync({ entryPoints: [filename], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' }).outputFiles[0].text
  const compiled = new Module(filename, module)
  compiled.filename = filename
  compiled.paths = module.paths
  compiled._compile(output, filename)
  const DateInput = compiled.exports.default
  let value = ''
  function App() {
    const [date, setDate] = React.useState('')
    value = date
    return React.createElement(DateInput, { value: date, onChange: setDate, label: '建议就医/检查日期' })
  }
  const root = createRoot(document.getElementById('root'))
  await React.act(async () => root.render(React.createElement(App)))
  const input = document.querySelector('input[type=text]')
  const change = async next => React.act(async () => fireChange(input, next))
  for (const partial of ['2', '20', '202', '2026', '20261', '202610', '2026100', '20261001']) await change(partial)
  assert.equal(value, '2026-10-01')
  await change('2026-10-1')
  assert.equal(value, '2026-10-1')
  await change('2026-10-10')
  assert.equal(value, '2026-10-10')
  await change('2026-02-29')
  assert.equal(input.getAttribute('aria-invalid'), 'true')
  assert.equal(value, '2026-02-29')
  await change('')
  assert.equal(value, '')
  await React.act(async () => fireChange(document.querySelector('input[type=date]'), '2026-12-31'))
  assert.equal(input.value, '2026-12-31')
  await React.act(async () => root.unmount())
  dom.window.close()
})

