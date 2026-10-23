const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { transformSync } = require('esbuild')
const staff = { _id: '6a28b5b4441e73bd7deb3ba5', role: 'familyDoctor' }
function render(data, error = '', actor = staff, props = {}) {
  const mocks = {
    'react-router-dom': { useNavigate: () => () => {} },
    '../App': { useStaff: () => ({ staff: actor }) },
    '../api': { getToken: () => 'test', staffAPI: {} },
    '../hooks/useWorkbenchResource': () => ({ data, error, loading: false, refresh() {} }),
  }
  const module = { exports: {} }
  const filename = path.join(__dirname, '../src/components/GeoReviewPanel.jsx')
  vm.runInNewContext(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, { module, exports: module.exports, require: n => mocks[n] || require(n) })
  return renderToStaticMarkup(React.createElement(module.exports.default, props))
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

test('compact entry keeps count but leaves article list to the GEO view', () => {
  const html = render([{_id:'one', title:'文章正文入口', status:'pending', currentRole:'familyDoctor'}], '', staff, {compact:true})
  assert.match(html, /待审核 1 篇/)
  assert.match(html, /进入 GEO 审核/)
  assert.doesNotMatch(html, /文章正文入口|查看并审核/)
})

test('revised pending articles show revision summary and history entrance', () => {
  const html = render([{_id:'one', title:'修订文章', status:'pending', currentRole:'familyDoctor', revisions:[{changeSummary:'按审核意见补正'}]}])
  assert.match(html, /修订后重新送审/)
  assert.match(html, /第2版/)
  assert.match(html, /按审核意见补正/)
  assert.match(html, /审核历史/)
})
