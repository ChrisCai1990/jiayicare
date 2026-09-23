const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const root=path.join(__dirname,'../..');
function load(){
 const util={module:{exports:{}}};vm.runInNewContext(require('esbuild').transformSync(fs.readFileSync(path.join(root,'staff/src/utils/followUpContinuity.js'),'utf8'),{format:'cjs'}).code,util);
 const ctx={module:{exports:{}},require:n=>n==='react'?{...React,useEffect:()=>{}}:n.includes('reminderFollowUp')?require('../../shared/reminderFollowUp.cjs'):util.module.exports};
 vm.runInNewContext(require('esbuild').transformSync(fs.readFileSync(path.join(root,'staff/src/components/FollowUpProgressFields.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code,ctx);return ctx.module.exports;
}
const item={_id:'a',sourceType:'scheduled',sourceScheduleKey:'medical_treatment:test',deliveryMode:'reminder'};
test('medical reminders explicitly continue or hand off, never offer direct completion',()=>{
 const m=load();
 for(const outcome of ['reminded','booked','unreachable','deferred','visited']){
  const form={status:'in_progress',outcome};const html=renderToStaticMarkup(React.createElement(m.default,{item,form,setForm:()=>{}}));
  assert.equal(m.followUpSaveLabel(item,form),outcome==='visited'?'保存并转资料审核':'保存并继续跟进');
  assert.ok(!html.includes('本次随访目标已达成'));assert.equal(html.includes('下次跟进时间'),outcome!=='visited');
 }
 assert.equal(m.followUpSaveLabel(item,{status:'completed'}),'保存并继续跟进');
});
test('ordinary one-contact followup can explicitly finish; continued followup retains next contact',()=>{
 const m=load();for(const status of ['completed','in_progress']){
  const form={status};const html=renderToStaticMarkup(React.createElement(m.default,{item:{_id:'plain'},form,setForm:()=>{}}));
  assert.ok(html.includes('本次随访目标已达成'));assert.equal(html.includes('下次跟进时间'),status!=='completed');
  assert.equal(m.followUpSaveLabel({_id:'plain'},form),status==='completed'?'完成本次随访':'保存并继续跟进');
 }
});
test('both followup entrances share action labels and hide duplicate progress status',()=>{
 for(const file of ['FollowUpsPage.jsx','PatientDetailPage.jsx']){
  const s=fs.readFileSync(path.join(root,'staff/src/pages',file),'utf8');
  assert.ok(s.includes('followUpSaveLabel(execItem, execForm)'));assert.match(s,/!execItem.taskRole && !canRecordProgress\(execItem\) && <div>\s*<label[^\n]+随访结果状态/);
 }
});
