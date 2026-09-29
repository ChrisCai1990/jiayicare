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

test('待核实反馈优先显示，未来日期也可处理，并打开同一任务',async()=>{
 const task={_id:'feedback',careFlowId:'f',taskRole:'executor',status:'planned',date:'2099-01-01',createdAt:'2026-01-01',theme:'核实客户就医反馈',patientId:{_id:'p',name:'合成客户'},feedbackReview:{label:'合成反馈',note:'仅测试'}};
 const others=Array.from({length:6},(_,i)=>({...task,_id:'old'+i,careFlowId:'old'+i,feedbackReview:null,theme:'旧任务'+i,date:'2020-01-01'}));
 const Panel=load('components/ServiceTasksPanel.jsx',{'../api':{staffAPI:{getServiceTasks:async()=>({data:[...others,task]})}},'../App':{useStaff:()=>({staff:{role:'healthManager'}})},'./AnnualDispatchCard':{__esModule:true,default:({task})=>React.createElement('div',null,'已打开任务:'+task._id)},'../../../shared/annualDispatch.cjs':{dedicated:()=>false,isExecution:()=>false},'../utils/serviceTaskTitle.mjs':{serviceTaskTitle:t=>t.theme},'../utils/plannerOrderProgress.mjs':{isCustomerOrder:()=>false,serviceTaskGroupKey:t=>t.careFlowId}}).default;
 const view=await mount(React.createElement(MemoryRouter,null,React.createElement(Panel)));
 try{await settle();assert.match(view.container.textContent,/客户已反馈 · 待你核实/);assert.match(view.container.textContent,/合成反馈/);assert.ok(view.container.textContent.indexOf('合成反馈')<view.container.textContent.indexOf('旧任务0'));await click(view.container,'查看反馈并核实');assert.match(view.container.textContent,/已打开任务:feedback/);}finally{await view.close();}
});
