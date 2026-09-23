const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const staffRequire = require('node:module').createRequire(path.join(__dirname, '../../staff/package.json'));
const React = staffRequire('react'), { renderToStaticMarkup } = staffRequire('react-dom/server');
const task = { sourceType:'annual_service', workflowKey:'service_request', status:'planned', deliveryType:'proxy_booking', formData:{serviceRequest:{mode:'single',moduleKey:'abnormal_followup',itemSnapshot:{items:'肾脏彩超'}}} };
const data = { task, parent:{plannedContent:'顾问完整依据',annualBooking:{status:'arranged',entries:[]}}, assistants:[{_id:'a',name:'就医专员甲'}] };
function render() {
  let n=0;
  const fakeReact = {...React, useEffect:()=>{}, useState: initial => [n++===0?data:(typeof initial==='function'?initial():initial),()=>{}]};
  const ctx={ module:{exports:{}}, require:name => name==='react'?fakeReact:name.endsWith('annualDispatch.cjs')?require('../../shared/annualDispatch.cjs'):name.endsWith('annualBookingPlan.cjs')?require('../../shared/annualBookingPlan.cjs'):name==='./AnnualBookingCard'?{BookingSummary:()=>React.createElement('div',null,'预约交接摘要')}:name==='./OnsiteBookingCard'?()=>null:{staffAPI:{}} };
  vm.runInNewContext(require('esbuild').transformSync(fs.readFileSync(path.join(__dirname,'../../staff/src/components/AnnualDispatchCard.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code,ctx);
  return renderToStaticMarkup(React.createElement(ctx.module.exports.default,{task,staff:{role:'healthPlanner'}}));
}
test('规划师实际组件只保留办理事项、交接与选人，原依据折叠',()=>{
  const html=render();
  for(const text of ['办理事项','预约与交接','安排就医专员','确认派单','代办预约','就医专员甲']) assert.ok(html.includes(text));
  for(const text of ['对应健管随访','实际服务','具体代办事项','随访内容','proxy_booking','>删除<','>编辑<']) assert.ok(!html.includes(text));
  assert.equal((html.match(/<select/g)||[]).length,1); assert.match(html,/<details><summary>查看完整顾问依据/);
});
