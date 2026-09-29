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


test('intake modal keeps server errors inside dialog and submits the displayed lead version', async () => {
  const row={_id:'lead',name:'测试咨询',topic:'服务',status:'new',updatedAt:'2026-09-29T00:00:00Z'};
  let submitted;
  const api={getVisitorLeads:async()=>({data:[row],total:1,limit:50}),updateVisitorLead:async(id,body)=>{submitted=body;throw Error('线索已变化，请刷新')}};
  const View=load('components/VisitorLeadWorkbench.jsx',{'../api':{staffAPI:api}}).default;
  const view=await mount(React.createElement(MemoryRouter,null,React.createElement(View,{toast:()=>{}})));
  try {
    await click(view.container,'记录联系');
    const form=view.container.querySelector('form');
    await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(submitted.baseUpdatedAt,row.updatedAt);
    assert.match(view.container.querySelector('[role=dialog]').textContent,/线索已变化/);
  } finally {await view.close()}
});
test('late lead list cannot replace service progress; closing an options request does not disable a new dialog',async()=>{
  let old,options;
  const row={_id:'intake',patientId:'patient',customer:{name:'测试客户'},serviceDirection:'medical_assistance',status:'open',revision:0,progress:{stage:'待落实服务',waiting:'待安排',canClose:true,current:[]}};
  const api={getVisitorLeads:()=>new Promise(r=>{old=r}),getServiceIntakes:async()=>({data:[row],total:1,limit:20}),getServiceIntakeOptions:()=>new Promise(r=>{options=r})};
  const View=load('components/VisitorLeadWorkbench.jsx',{'../api':{staffAPI:api}}).default;
  const view=await mount(React.createElement(MemoryRouter,null,React.createElement(View,{toast:()=>{}})));
  try {
    await click(view.container,'服务承接与进度');
    await act(async()=>old({data:[{_id:'old',name:'迟到咨询'}],total:1,limit:50}));
    assert.match(view.container.textContent,/测试客户/);assert.doesNotMatch(view.container.textContent,/迟到咨询/);
    await click(view.container,'关联实际服务');await click(view.container,'关闭');await click(view.container,'追加跟进');
    assert.equal(view.container.querySelector('button[type=submit]').disabled,false);
    await act(async()=>options({data:{orders:[],plans:[]}}));
    assert.match(view.container.querySelector('[role=dialog]').textContent,/下次跟进时间/);
  }finally{await view.close()}
});
