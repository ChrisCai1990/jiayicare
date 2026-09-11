const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture({bound=true,stillBound=true}={}){
  const calls={context:0,model:0,sends:0,logs:0,updates:[]};
  const contact={_id:'binding',user:{_id:'patient-a',isDeleted:false}};
  const models={
    '../models/WecomKfContact':{findOne:()=>({populate:async()=>bound?contact:null}),exists:async()=>stillBound},
    '../models/WecomKfMessage':{updateOne:async(f,u)=>{calls.updates.push(u);return {upsertedCount:1};},findOne:async()=>null},
    '../models/ChatLog':{create:async()=>{calls.logs++;}},
    '../models/WecomKfCursor':{},'../models/FollowUp':{},
    './wecomKfContext':{buildWecomKfContext:async(id,text)=>{calls.context++;assert.equal(id,'patient-a');return {messages:[{role:'user',content:text}],systemPrompt:'绑定客户的历史与档案'};}},
    './ai':{chat:async(messages,options)=>{calls.model++;assert.equal(options.systemPrompt,'绑定客户的历史与档案');return '根据已有记录回答';}},
  };
  const sandbox={module:{exports:{}},require:key=>{assert.ok(models[key],key);return models[key];},process:{env:{WECOM_KF_AI_ENABLED:'true'}},console,AbortSignal,URLSearchParams,fetch:async url=>{
    if(String(url).includes('/send_msg?'))calls.sends++;
    return {ok:true,json:async()=>({errcode:0,service_state:1})};
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/utils/wecomKf.js'),'utf8'),sandbox);
  return {calls,kf:sandbox.module.exports,args:{corpId:'corp',openKfId:'account',token:'synthetic',item:{msgid:'message',external_userid:'external',origin:3,msgtype:'text',text:{content:'之前聊过什么'}}}};
}
test('绑定客服使用上下文生成回复，发送成功后写入共同历史',async()=>{
  const f=fixture();await f.kf.answer(f.args);
  assert.equal(f.calls.context,1);assert.equal(f.calls.model,1);assert.equal(f.calls.sends,1);assert.equal(f.calls.logs,1);
});
test('未绑定客户不读取历史和档案',async()=>{
  const f=fixture({bound:false});await f.kf.answer(f.args);
  assert.equal(f.calls.context,0);assert.equal(f.calls.model,0);assert.equal(f.calls.logs,0);
});
test('生成期间解绑后不发送包含个人资料的回答',async()=>{
  const f=fixture({stillBound:false});await f.kf.answer(f.args);
  assert.equal(f.calls.context,1);assert.equal(f.calls.sends,0);assert.equal(f.calls.logs,0);
  assert.ok(f.calls.updates.some(u=>u.$set?.errorCode==='binding_changed'));
});
