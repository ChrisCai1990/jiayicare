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
 const task={_id:'feedback',careFlowId:'f',taskRole:'executor',status:'planned',date:'2099-01-01',createdAt:'2026-01-01',theme:'核实客户就医反馈',patientId:{_id:'p',name:'合成客户'},feedbackReview:{label:'合成反馈',note:'仅测试',submittedAt:'2026-01-02T03:04:00Z'}};
 const others=Array.from({length:6},(_,i)=>({...task,_id:'old'+i,careFlowId:'old'+i,feedbackReview:null,theme:'旧任务'+i,date:'2020-01-01'}));
 const Panel=load('components/ServiceTasksPanel.jsx',{'../api':{staffAPI:{getServiceTasks:async()=>({data:[...others,task]})}},'../App':{useStaff:()=>({staff:{role:'healthManager'}})},'./AnnualDispatchCard':{__esModule:true,default:({task})=>React.createElement('div',null,'已打开任务:'+task._id)},'../../../shared/annualDispatch.cjs':{dedicated:()=>false,isExecution:()=>false},'../utils/serviceTaskTitle.mjs':{serviceTaskTitle:t=>t.theme},'../utils/plannerOrderProgress.mjs':{isCustomerOrder:()=>false,serviceTaskGroupKey:t=>t.careFlowId}}).default;
 const view=await mount(React.createElement(MemoryRouter,null,React.createElement(Panel)));
 try{await settle();assert.match(view.container.textContent,/客户已反馈 · 待你核实/);assert.match(view.container.textContent,/合成反馈/);assert.match(view.container.textContent,/客户提交：2026年1月2日/);assert.ok(view.container.textContent.indexOf('合成反馈')<view.container.textContent.indexOf('旧任务0'));await click(view.container,'查看反馈并核实');assert.match(view.container.textContent,/已打开任务:feedback/);}finally{await view.close();}
});

test('核实操作合并到底部，确认仍需显式勾选并保留原反馈',async()=>{
 const config=require('../../shared/careFlow.cjs');let submitted;
 const data={_id:'flow',revision:3,patientId:'p',reports:[],events:[],state:{title:'合成服务',stage:'upload',people:{healthManager:{id:'m',role:'healthManager',name:'测试专员'}},data:{},returns:[],customerUpload:{declaration:{label:'合成原反馈',submittedAt:'2026-01-02T03:04:00Z'}}}};
 const blank=()=>null;
 const Card=load('components/CareFlowCard.jsx',{'../api':{careFlowAPI:{action:async(id,payload)=>{submitted=payload;return {data}},get:async()=>({data})}},'../../../shared/careFlow.cjs':config,'../../../shared/annualBookingPlan.cjs':{bookingSlots:()=>[]},'../../../shared/annualConsultationBrief.cjs':{consultationBrief:()=>({})},'./CareFlowHandoff':blank,'./CareFlowReviewEvidence':blank,'./CareFlowReportUploads':()=>React.createElement('div',null,'上传测试区域'),'./CareFlowExaminations':{__esModule:true,default:blank,initialExaminations:()=>[]}}).default;
 window.HTMLElement.prototype.scrollIntoView=function(){};
 const view=await mount(React.createElement(Card,{task:{_id:'t'},staff:{_id:'m',role:'healthManager'},initialData:data}));
 try{
 assert.match(view.container.textContent,/客户提交：2026年1月2日/);
 const confirm=[...view.container.querySelectorAll('button')].find(b=>b.textContent==='确认核实并提交');assert.equal(confirm.disabled,true);assert.equal(view.container.querySelectorAll('.care-flow-actions .btn-primary').length,1);assert.doesNotMatch(view.container.textContent,/填写 \/ 修改核实意见|完成本环节，交下一步/);
 await click(view.container,'退回修订');assert.equal(view.container.querySelector('details[aria-label="退回修订"]').open,true);
 assert.match(view.container.textContent,/上传测试区域/);
 const noDocs=view.container.querySelector('input[type="checkbox"]');await act(async()=>noDocs.click());
 assert.doesNotMatch(view.container.textContent,/上传测试区域/);assert.match(view.container.textContent,/补充核实意见（选填）/);
 assert.equal(confirm.disabled,false);await click(view.container,'确认核实并提交');assert.equal(submitted.action,'complete');assert.equal(submitted.confirmed,true);assert.equal(submitted.value.noDocuments,true);assert.equal(submitted.value.note,'已核实客户反馈：合成原反馈');assert.equal(data.state.customerUpload.declaration.label,'合成原反馈');
 }finally{await view.close();}
});


test('无资料审核隐藏报告入口，空意见定位字段且不提交，保留权限',async()=>{
 const config=require('../../shared/careFlow.cjs');let calls=0;
 const data={_id:'flow',revision:3,patientId:'p',reports:[],events:[],state:{title:'合成服务',stage:'audit',people:{healthManager:{id:'m',role:'healthManager',name:'测试专员'}},data:{upload:{noDocuments:true}},returns:[],customerUpload:{declaration:{label:'合成反馈'}}}};
 const blank=()=>null;
 const Card=load('components/CareFlowCard.jsx',{'../api':{careFlowAPI:{action:async()=>{calls++;return {data}}}},'../../../shared/careFlow.cjs':config,'../../../shared/annualBookingPlan.cjs':{bookingSlots:()=>[]},'../../../shared/annualConsultationBrief.cjs':{consultationBrief:()=>({})},'./CareFlowHandoff':blank,'./CareFlowReviewEvidence':blank,'./CareFlowReportUploads':blank,'./CareFlowExaminations':{__esModule:true,default:blank,initialExaminations:()=>[]}}).default;
 window.HTMLElement.prototype.scrollIntoView=function(){};
 const view=await mount(React.createElement(Card,{task:{_id:'t'},staff:{_id:'m',role:'healthManager'},initialData:data}));
 try{
 assert.doesNotMatch(view.container.textContent,/打开客户报告管理/);
 await act(async()=>view.container.querySelector('input[type="checkbox"]').click());
 await click(view.container,'确认核实并提交');assert.equal(calls,0);
 assert.match(view.container.textContent,/请填写本次核实意见/);
 assert.equal(document.activeElement,view.container.querySelector('textarea[aria-invalid="true"]'));
 assert.ok(view.container.querySelector('.care-flow-form').compareDocumentPosition(view.container.querySelector('.care-flow-reference'))&window.Node.DOCUMENT_POSITION_FOLLOWING);
 }finally{await view.close()}
 const other=await mount(React.createElement(Card,{task:{_id:'t'},staff:{_id:'other',role:'healthManager'},initialData:data}));
 try{assert.equal(other.container.querySelector('.care-flow-actions'),null)}finally{await other.close()}
});
