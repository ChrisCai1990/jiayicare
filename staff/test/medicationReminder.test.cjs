const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const {transformSync}=require('esbuild'), {JSDOM}=require('jsdom');
const dom=new JSDOM('<html><body></body></html>'); global.window=dom.window; global.document=dom.window.document; global.navigator=dom.window.navigator; global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'), {createRoot}=require('react-dom/client'), act=React.act || require('react-dom/test-utils').act;
const mod={exports:{}};
vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../src/components/MedicationReminderModal.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code,{module:mod,exports:mod.exports,require:name=>name==='react'?React:require('../../shared/medicationReminder.cjs')});
async function setup(medication, onSave) {
  const el=document.createElement('div');document.body.append(el);const root=createRoot(el);let closed=0;
  await act(async()=>root.render(React.createElement(mod.exports.default,{medication,onSave,onClose:()=>closed++})));
  return {el,get closed(){return closed},async click(text){const b=[...el.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(b,text);await act(async()=>b.click())},async close(){await act(async()=>root.unmount());el.remove()}};
}
test('three daily inputs submit together; server errors remain inside modal; legacy times can be replaced',async()=>{
  let payload;
  const h=await setup({name:'测试药',dosage:'1粒',frequency:'一天3次',timing:'餐后'},async p=>{payload=p;throw new Error('保存测试错误')});
  try{
    assert.equal(h.el.querySelectorAll('input[type=time]').length,3);
    assert.ok(h.el.textContent.includes('餐后'));
    await h.click('生成用药提醒');assert.deepEqual(Array.from(payload.remindTimes),['08:00','12:00','18:00']);assert.equal(payload.intervalDays,1);
    assert.equal(h.el.querySelector('[role=alert]').textContent,'保存测试错误');assert.equal(h.closed,0);
  }finally{await h.close()}
  const old=await setup({name:'测试药',reminder:{enabled:true,remindTime:'10:15',intervalDays:30}},async p=>{payload=p});
  try{assert.equal(old.el.querySelector('input[type=time]').value,'10:15');await old.click('设为每日早、中、晚三次');await old.click('生成用药提醒');assert.equal(payload.intervalDays,1);assert.equal(payload.remindTimes.length,3);assert.equal(old.closed,1)}finally{await old.close()}
});
test('blank added time blocks saving; expired dates do not prevent disabling',async()=>{
  let payload;
  const h=await setup({name:'测试药'},async p=>{payload=p});
  try{await h.click('＋添加提醒时间');assert.ok(h.el.querySelector('[role=alert]'));const b=[...h.el.querySelectorAll('button')].find(x=>x.textContent==='生成用药提醒');assert.equal(b.disabled,true)}finally{await h.close()}
  const expired=await setup({name:'测试药',reminder:{enabled:true,endDate:'2020-01-01'}},async p=>{payload=p});
  try{await expired.click('关闭提醒');assert.equal(payload.enabled,false);assert.equal(expired.closed,1)}finally{await expired.close()}
});
