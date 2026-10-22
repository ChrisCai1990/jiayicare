const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { transformSync } = require('esbuild')
const staff = { _id: '6a28b5b4441e73bd7deb3ba5', role: 'familyDoctor' }
function render(data, error = '', actor = staff) {
  const mocks = {
    'react-router-dom': { useNavigate: () => () => {} },
    '../App': { useStaff: () => ({ staff: actor }) },
    '../api': { getToken: () => 'test', staffAPI: {} },
    '../hooks/useWorkbenchResource': () => ({ data, error, loading: false, refresh() {} }),
  }
  const module = { exports: {} }
  const filename = path.join(__dirname, '../src/components/GeoReviewPanel.jsx')
  vm.runInNewContext(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, { module, exports: module.exports, require: n => mocks[n] || require(n) })
  return renderToStaticMarkup(React.createElement(module.exports.default))
}
test('designated doctor sees seven current pending articles, not returned or published drafts', () => {
  const data = Array.from({length:7}, (_,i) => ({_id:String(i), title:`待审稿${i}`, status:'pending', currentRole:'familyDoctor'}))
  const html = render([...data, {_id:'old',title:'退回旧稿',status:'changes_requested'}, {_id:'done',title:'已发表',status:'published'}])
  assert.match(html,/待审核 7 篇/)
  assert.doesNotMatch(html,/退回旧稿|已发表/)
  assert.equal((html.match(/查看并审核/g)||[]).length,7)
})
test('failed fetch is not presented as an empty queue', () => {
  const html=render([], '网络错误')
  assert.match(html,/待核实/)
  assert.match(html,/审核稿加载失败/)
  assert.doesNotMatch(html,/当前没有待/)
})
test('other doctors do not acquire the designated reviewer entry', () => {
  assert.equal(render([], '', {...staff,_id:'another-account'}),'')
})
