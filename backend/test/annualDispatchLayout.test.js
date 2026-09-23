const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const staffRequire = require('node:module').createRequire(path.join(__dirname, '../../staff/package.json'));
const React = staffRequire('react'), { renderToStaticMarkup } = staffRequire('react-dom/server');
const task = { sourceType:'annual_service', workflowKey:'service_request', status:'planned', deliveryType:'proxy_booking', formData:{serviceRequest:{mode:'single',moduleKey:'abnormal_followup',itemSnapshot:{items:'肾脏彩超'}}} };
const data = { task, parent:{plannedContent:'顾问完整依据',annualBooking:{status:'arranged',entries:[]}}, assistants:[{_id:'a',name:'就医专员甲'}] };
function render(viewTask = task, viewData = data) {
  let n=0;
  const fakeReact = {...React, useEffect:()=>{}, useState: initial => [n++===0?viewData:(typeof initial==='function'?initial():initial),()=>{}]};
  const ctx={ module:{exports:{}}, require:name => name==='react'?fakeReact:name.endsWith('annualConsultationBrief.cjs')?require('../../shared/annualConsultationBrief.cjs'):name.endsWith('annualDispatch.cjs')?require('../../shared/annualDispatch.cjs'):name.endsWith('annualBookingPlan.cjs')?require('../../shared/annualBookingPlan.cjs'):name==='./AnnualBookingCard'?{BookingSummary:()=>React.createElement('div',null,'预约交接摘要')}:name==='./OnsiteBookingCard'?()=>null:{staffAPI:{}} };
  vm.runInNewContext(require('esbuild').transformSync(fs.readFileSync(path.join(__dirname,'../../staff/src/components/AnnualDispatchCard.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code,ctx);
  return renderToStaticMarkup(React.createElement(ctx.module.exports.default,{task:viewTask,staff:{role:viewTask.workflowKey === 'assistance_execute' ? 'medicalAssistant' : 'healthPlanner'}}));
}
test('规划师实际组件只保留办理事项、交接与选人，原依据折叠',()=>{
  const html=render();
  for(const text of ['办理事项','预约与交接','安排就医专员','确认派单','代办预约','就医专员甲']) assert.ok(html.includes(text));
  for(const text of ['对应健管随访','实际服务','具体代办事项','随访内容','proxy_booking','>删除<','>编辑<']) assert.ok(!html.includes(text));
  assert.equal((html.match(/<select/g)||[]).length,1); assert.match(html,/<details><summary>查看完整顾问依据/);
});
test('专家沟通目的默认展开，缺依据明确提示而不编造',()=>{
  const html=render();
  assert.ok(html.includes('就医目的与专家沟通')); assert.ok(html.includes('请健康顾问补充'));
  assert.ok(html.indexOf('就医目的与专家沟通') < html.indexOf('<details>'));
});
test('就医专员执行页同样显示派单时原因依据，并收集专家反馈',()=>{
  const execution={sourceType:'annual_service',workflowKey:'assistance_execute'};
  const request={...task,annualDispatch:{status:'active',itemSnapshot:{items:'肾脏彩超',reason:'稳定性随访',basisSummary:'既往报告记录'},advisorPlanText:'原计划'}};
  const html=render(execution,{...data,task:request,child:execution});
  for(const text of ['稳定性随访','既往报告记录','与专家沟通什么','是否适合、是否需要开单','专家沟通与办理结果']) assert.ok(html.includes(text));
  assert.ok(!html.includes('安排就医专员')); assert.ok(html.indexOf('稳定性随访') < html.indexOf('<details>'));
});
