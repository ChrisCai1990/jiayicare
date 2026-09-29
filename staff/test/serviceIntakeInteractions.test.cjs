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
    window, document, console, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval, Event: window.Event,
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


test('website summary and chronological contact records remain separate with explicit Beijing times', async () => {
  const row = { _id:'lead', name:'虚构咨询', status:'contacted', summary:'网页上确认的服务问题', createdAt:'2026-09-29T01:00:00Z', contactEvents:[
    { status:'contacted', note:'电话确认需求', at:'2026-09-29T02:30:00Z', actorName:'规划师' },
    { status:'closed', note:'客户暂不需要服务', at:'2026-09-29T03:00:00Z' },
  ] };
  const View=load('components/VisitorLeadWorkbench.jsx',{'../api':{staffAPI:{getVisitorLeads:async()=>({data:[row],total:1,limit:50})}}}).default;
  const view=await mount(React.createElement(MemoryRouter,null,React.createElement(View,{toast:()=>{}})));
  try {
    const sections=view.container.querySelectorAll('.consultation-content');
    assert.match(sections[0].textContent,/网页上确认的服务问题/);
    assert.doesNotMatch(sections[0].textContent,/电话确认需求/);
    assert.match(sections[1].textContent,/电话确认需求/);
    assert.match(sections[1].textContent,/10:30:00/);
    assert.match(sections[1].textContent,/11:00:00/);
    assert.match(sections[0].textContent,/9:00:00/);
    assert.match(sections[0].textContent,/北京时间/);
    assert.ok(sections[1].textContent.indexOf('客户暂不需要') < sections[1].textContent.indexOf('电话确认'));
  } finally { await view.close() }
});


for (const count of [0, 1, 2]) test(`customer matching with ${count} results avoids duplicate entry and requires confirmation`, async () => {
  const row={_id:'lead',name:'咨询客户',phone:'19900000000',status:'contacted'};
  const matches=Array.from({length:count},(_,i)=>({_id:'p'+i,name:'已有客户'+i,phone:row.phone}));
  let submitted=false;
  const View=load('components/VisitorLeadWorkbench.jsx',{'../api':{staffAPI:{
    getVisitorLeads:async()=>({data:[row],total:1,limit:50}),
    matchVisitorLeadCustomer:async id=>{assert.equal(id,'lead');return {data:matches}},
    convertVisitorLead:async()=>{submitted=true},
  }}}).default;
  const view=await mount(React.createElement(MemoryRouter,null,React.createElement(View,{toast:()=>{}})));
  try {
    await click(view.container,'确认客户与服务需求');
    const dialog=view.container.querySelector('[role=dialog]');
    assert.equal(!!dialog.querySelector('input[aria-label="查找已有客户"]'),count!==1);
    assert.equal(dialog.querySelector('input[type=checkbox]').checked,false);
    await act(async()=>dialog.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(submitted,false);
    if(count===1) {
      assert.match(dialog.textContent,/已有客户0/);
      await click(dialog,'更换客户');
      assert.equal(dialog.querySelector('select').value,'');
    }
  } finally {await view.close()}
});

test('late customer match cannot overwrite a newly opened contact dialog', async () => {
  let resolve;
  const row={_id:'lead',name:'咨询客户',phone:'19900000000',status:'contacted'};
  const View=load('components/VisitorLeadWorkbench.jsx',{'../api':{staffAPI:{getVisitorLeads:async()=>({data:[row],total:1,limit:50}),matchVisitorLeadCustomer:()=>new Promise(r=>{resolve=r})}}}).default;
  const view=await mount(React.createElement(MemoryRouter,null,React.createElement(View,{toast:()=>{}})));
  try {
    await click(view.container,'确认客户与服务需求');
    await click(view.container.querySelector('[role=dialog]'),'关闭');
    await click(view.container,'追加联系记录');
    await act(async()=>resolve({data:[{_id:'late',name:'迟到客户',phone:row.phone}]}));
    assert.doesNotMatch(view.container.querySelector('[role=dialog]').textContent,/迟到客户/);
    assert.equal(view.container.querySelector('button[type=submit]').disabled,false);
  } finally {await view.close()}
});


test('loaded lead switches to its exact intake without rendering lead data as service progress', async () => {
  let finish, query;
  const row={_id:'lead',intakeId:'intake-1',name:'咨询客户',status:'contacted'};
  const View=load('components/VisitorLeadWorkbench.jsx',{'../api':{staffAPI:{
    getVisitorLeads:async()=>({data:[row],total:1,limit:50}),
    getServiceIntakes:args=>{query=args;return new Promise(resolve=>{finish=resolve})},
  }}}).default;
  const view=await mount(React.createElement(MemoryRouter,null,React.createElement(View,{toast:()=>{}})));
  try {
    await click(view.container,'查看服务承接');
    assert.match(view.container.textContent,/正在加载/);
    assert.equal(query.itemId,'intake-1');assert.equal(query.status,'');
    await act(async()=>finish({data:[{_id:'intake-1',customer:{name:'已关联客户'},status:'closed',progress:{stage:'承接已关闭',current:[],canClose:true}}],total:1,limit:50}));
    assert.match(view.container.textContent,/已关联客户/);
    assert.match(view.container.textContent,/承接已关闭/);
    await click(view.container,'官网咨询');
    assert.match(view.container.textContent,/咨询客户/);
  } finally {await view.close()}
});


test('service load failure stays visible and refresh recovers without stale lead rows', async () => {
  let fail=true;
  const View=load('components/VisitorLeadWorkbench.jsx',{'../api':{staffAPI:{
    getVisitorLeads:async()=>({data:[{_id:'lead',name:'原咨询',status:'contacted',intakeId:'target'}],total:1,limit:50}),
    getServiceIntakes:async()=>{if(fail) throw Error('暂时无法加载');return {data:[],total:0,limit:50}},
  }}}).default;
  const view=await mount(React.createElement(MemoryRouter,null,React.createElement(View,{toast:()=>{}})));
  try {
    await click(view.container,'查看服务承接');
    assert.match(view.container.querySelector('[role=alert]').textContent,/暂时无法加载/);
    assert.doesNotMatch(view.container.textContent,/原咨询/);
    fail=false;await click(view.container,'刷新');
    assert.equal(view.container.querySelector('[role=alert]'),null);
    await click(view.container,'服务承接与进度');
    assert.doesNotMatch(view.container.textContent,/正在加载/);
  } finally {await view.close()}
});

test('direct service link defaults to open rather than lead status', async () => {
  let query;
  const View=load('components/VisitorLeadWorkbench.jsx',{'../api':{staffAPI:{getServiceIntakes:async args=>{query=args;return {data:[],total:0,limit:50}}}}}).default;
  const view=await mount(React.createElement(MemoryRouter,{initialEntries:['/visitor-leads?workbench=intakes&itemId=target']},React.createElement(View,{toast:()=>{}})));
  try {assert.equal(query.status,'open');assert.equal(query.itemId,'target')}finally{await view.close()}
});


test('ending followup requires conclusion but no next date and removes closed record from open list', async () => {
 let saved;
 const row={_id:'i',revision:3,status:'open',customer:{name:'示例客户'},orderId:'o',progress:{stage:'原服务已结束',current:[],canClose:true}};
 const View=load('components/VisitorLeadWorkbench.jsx',{'../api':{staffAPI:{getServiceIntakes:async()=>({data:saved?[]:[row],total:saved?0:1,limit:50}),updateServiceIntake:async(id,body)=>{saved={id,body}}}}}).default;
 const view=await mount(React.createElement(MemoryRouter,{initialEntries:['/visitor-leads?workbench=intakes']},React.createElement(View,{toast:()=>{}})));
 try {
  await click(view.container,'结束跟进');
  const dialog=view.container.querySelector('[role=dialog]');
  assert.equal(dialog.querySelector('input[type=datetime-local]'),null);
  assert.equal(dialog.querySelector('textarea').required,true);
  await act(async()=>{const input=dialog.querySelector('textarea');Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(input,'客户无需继续跟进');input.dispatchEvent(new window.Event('input',{bubbles:true}))});
  await act(async()=>dialog.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(saved.id,'i');assert.equal(saved.body.action,'close');assert.equal(saved.body.revision,3);assert.equal('nextContactAt' in saved.body,false);
  assert.match(view.container.textContent,/当前没有符合条件/);
 } finally {await view.close()}
});


test('linking an order ends consultation without asking for another followup date', async () => {
 let saved;
 const row={_id:'i',revision:1,status:'open',customer:{name:'示例'},progress:{stage:'待落实服务',current:[],canClose:true}};
 const View=load('components/VisitorLeadWorkbench.jsx',{'../api':{staffAPI:{getServiceIntakes:async()=>({data:saved?[]:[row],total:saved?0:1,limit:50}),getServiceIntakeOptions:async()=>({data:{orders:[{_id:'order',serviceName:'示例订单'}]}}),updateServiceIntake:async(id,body)=>{saved=body}}}}).default;
 const view=await mount(React.createElement(MemoryRouter,{initialEntries:['/visitor-leads?workbench=intakes']},React.createElement(View,{toast:()=>{}})));
 try {
  await click(view.container,'关联实际服务');const dialog=view.container.querySelector('[role=dialog]');
  assert.equal(dialog.querySelector('input[type=datetime-local]'),null);
  await act(async()=>{const select=dialog.querySelector('select');select.value='order';select.dispatchEvent(new window.Event('change',{bubbles:true}))});
  await act(async()=>dialog.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(saved.action,'link');assert.equal(saved.orderId,'order');assert.equal('nextContactAt' in saved,false);
 } finally {await view.close()}
});
