const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('crypto');
const crypto=require('../src/utils/wecomAppCrypto');
const Cursor=require('../src/models/WecomKfCursor');
const Message=require('../src/models/WecomKfMessage');
const Contact=require('../src/models/WecomKfContact');
const FollowUp=require('../src/models/FollowUp');

test('微信客服回调仅在显式启用且签名、收件方、事件都正确时接受',async(t)=>{
  const names=['WECOM_KF_ENABLED','WECOM_KF_CORP_ID','WECOM_KF_SECRET','WECOM_KF_TOKEN','WECOM_KF_AES_KEY','WECOM_KF_AI_ENABLED'];
  const before=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  t.after(()=>{for(const k of names){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}});
  Object.assign(process.env,{WECOM_KF_ENABLED:'true',WECOM_KF_CORP_ID:'ww_kf_test',WECOM_KF_SECRET:'synthetic',WECOM_KF_TOKEN:'token',WECOM_KF_AES_KEY:randomBytes(32).toString('base64').slice(0,43)});
  const app=require('express')();app.use('/',require('../src/routes/wecomKfCallback'));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
  const base='http://127.0.0.1:'+server.address().port;
  const httpFetch=global.fetch;
  const key=process.env.WECOM_KF_AES_KEY,stamp=String(Math.floor(Date.now()/1000)),nonce='synthetic';
  const signed=(encrypted,extra={})=>new URLSearchParams({timestamp:stamp,nonce,msg_signature:crypto.signature('token',stamp,nonce,encrypted),...extra});
  const challenge=crypto.encrypt('challenge',key,'ww_kf_test');
  assert.equal(await (await httpFetch(base+'?'+signed(challenge,{echostr:challenge}))).text(),'challenge');
  const wrong=crypto.encrypt('<xml><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[wrong]]></Event></xml>',key,'ww_kf_test');
  assert.equal((await httpFetch(base+'?'+signed(wrong),{method:'POST',headers:{'Content-Type':'application/xml'},body:'<xml><Encrypt><![CDATA['+wrong+']]></Encrypt></xml>'})).status,403);
  const oldFetch=global.fetch;const calls=[];
  const oldFindOne=Cursor.findOne;
  Cursor.findOne=async()=>null;
  t.after(()=>{Cursor.findOne=oldFindOne;});
  global.fetch=async(url,options)=>{calls.push({url:String(url),options});return {ok:true,json:async()=>String(url).includes('/gettoken?')?{access_token:'test-token'}:{errcode:0,msg_list:[]}};};
  t.after(()=>{global.fetch=oldFetch;});
  const event=crypto.encrypt('<xml><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[kf_msg_or_event]]></Event><OpenKfId><![CDATA[wk_test]]></OpenKfId><Token><![CDATA[callback-token]]></Token></xml>',key,'ww_kf_test');
  const accepted=await httpFetch(base+'?'+signed(event),{method:'POST',headers:{'Content-Type':'application/xml'},body:'<xml><Encrypt><![CDATA['+event+']]></Encrypt></xml>'});
  assert.equal(await accepted.text(),'success');
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,2);assert.match(calls[1].url,/\/kf\/sync_msg/);assert.match(calls[1].options.body,/callback-token/);
});

test('微信客服同步在成功处理后才保存下一游标',async(t)=>{
  const names=['WECOM_KF_ENABLED','WECOM_KF_CORP_ID','WECOM_KF_SECRET','WECOM_KF_TOKEN','WECOM_KF_AES_KEY'];
  const before=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  t.after(()=>{for(const k of names){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}});
  Object.assign(process.env,{WECOM_KF_ENABLED:'true',WECOM_KF_CORP_ID:'ww_kf_test',WECOM_KF_SECRET:'synthetic',WECOM_KF_TOKEN:'token',WECOM_KF_AES_KEY:randomBytes(32).toString('base64').slice(0,43)});
  const kf=require('../src/utils/wecomKf');
  const oldFetch=global.fetch,oldFindOne=Cursor.findOne,oldUpdate=Cursor.findOneAndUpdate;
  t.after(()=>{global.fetch=oldFetch;Cursor.findOne=oldFindOne;Cursor.findOneAndUpdate=oldUpdate;});
  let saved=null;
  Cursor.findOne=async()=>({cursor:'cursor-before'});
  Cursor.findOneAndUpdate=async(filter,update)=>{saved={filter,update};};
  let syncBody=null;
  global.fetch=async(url,options)=>{
    if(String(url).includes('/kf/sync_msg'))syncBody=JSON.parse(options.body);
    return {ok:true,json:async()=>String(url).includes('/gettoken?')?{access_token:'test-token'}:{errcode:0,msg_list:[],next_cursor:'cursor-after'}};
  };
  await kf.sync({openKfId:'wk_test',callbackToken:'callback-token'});
  assert.deepEqual(syncBody,{open_kfid:'wk_test',token:'callback-token',limit:100,cursor:'cursor-before'});
  assert.deepEqual(saved,{filter:{corpId:'ww_kf_test',openKfId:'wk_test'},update:{$set:{cursor:'cursor-after'}}});
});

test('高风险微信客服消息只转人工并创建不含原文的待办',async(t)=>{
  const kf=require('../src/utils/wecomKf');
  const originals={
    fetch:global.fetch,updateOne:Message.updateOne,findOne:Message.findOne,
    contactFindOne:Contact.findOne,create:FollowUp.create,
  };
  t.after(()=>Object.assign(global,{fetch:originals.fetch}));
  t.after(()=>{Message.updateOne=originals.updateOne;Message.findOne=originals.findOne;Contact.findOne=originals.contactFindOne;FollowUp.create=originals.create;});
  const updates=[];let created=null;
  Message.updateOne=async(...args)=>{updates.push(args);return {upsertedCount:updates.length===1?1:0};};
  Message.findOne=async()=>null;
  Contact.findOne=()=>({populate:async()=>({user:{_id:'patient-1',isDeleted:false,assignedNutritionist:'staff-1'}})});
  FollowUp.create=async(data)=>{created=data;return {_id:'followup-1'};};
  global.fetch=async()=>({ok:true,json:async()=>({errcode:0})});
  await kf.answer({corpId:'ww_test',openKfId:'wk_test',token:'token',item:{msgid:'m-risk',origin:3,external_userid:'external-1',msgtype:'text',text:{content:'我胸痛，需要吃什么药？'}}});
  assert.equal(created.assignedTo,'staff-1');
  assert.equal(created.patientId,'patient-1');
  assert.equal(created.status,'planned');
  assert.equal(created.content.includes('胸痛'),false);
  assert.deepEqual(created.tags,['微信客服','需人工接管']);
  assert.ok(updates.some(([,update])=>update.$set?.status==='handoff'));
});
