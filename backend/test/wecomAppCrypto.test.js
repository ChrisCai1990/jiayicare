const test=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('crypto');
const c=require('../src/utils/wecomAppCrypto');
test('encrypted callback round-trip, signature, tenant and padding failures',()=>{
  const key=randomBytes(32).toString('base64').slice(0,43),corp='ww_synthetic';
  const value='<xml><Content><![CDATA[测试文字 <不是命令>]]></Content></xml>';
  const encrypted=c.encrypt(value,key,corp),timestamp=String(Math.floor(Date.now()/1000)),nonce='synthetic';
  const q={timestamp,nonce,msg_signature:c.signature('token',timestamp,nonce,encrypted)};
  c.verify(q,encrypted,'token');assert.equal(c.decrypt(encrypted,key,corp),value);
  assert.equal(c.field(value,'Content'),'测试文字 <不是命令>');
  assert.throws(()=>c.verify({...q,msg_signature:'0'.repeat(40)},encrypted,'token'));
  assert.throws(()=>c.verify(q,encrypted,'token',Date.now()+601000));
  assert.throws(()=>c.decrypt(encrypted,key,'different-corp'));
  assert.throws(()=>c.field('<!DOCTYPE xml><Content>x</Content>','Content'));
  assert.throws(()=>c.field('<Content>a</Content><Content>b</Content>','Content'));
});
test('inbox ciphertext authenticates payload and rejects tampering',()=>{
  process.env.WECOM_APP_INBOX_KEY=randomBytes(32).toString('hex');
  const {seal,open}=require('../src/utils/wecomAppInboxCrypto');
  const sealed=seal('虚构测试资料');assert.equal(open(sealed),'虚构测试资料');
  const tampered=Buffer.from(sealed,'base64');tampered[tampered.length-1]^=1;
  assert.throws(()=>open(tampered.toString('base64')));
  delete process.env.WECOM_APP_INBOX_KEY;
});
test('callback gate, valid URL challenge and wrong application are enforced',async(t)=>{
  const express=require('express'),app=express();app.use('/',require('../src/routes/wecomAppCallback'));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>{server.close();for(const k of ['WECOM_APP_CALLBACK_ENABLED','WECOM_APP_CALLBACK_TOKEN','WECOM_APP_CALLBACK_AES_KEY','WECOM_CORP_ID','WECOM_AGENT_ID'])delete process.env[k];});
  const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base)).status,503);
  Object.assign(process.env,{WECOM_APP_CALLBACK_ENABLED:'true',WECOM_APP_CALLBACK_TOKEN:'test',WECOM_APP_CALLBACK_AES_KEY:randomBytes(32).toString('base64').slice(0,43),WECOM_CORP_ID:'ww_test',WECOM_AGENT_ID:'123'});
  const key=process.env.WECOM_APP_CALLBACK_AES_KEY, timestamp=String(Math.floor(Date.now()/1000)),nonce='test';
  const signed=e=>new URLSearchParams({timestamp,nonce,msg_signature:c.signature('test',timestamp,nonce,e),echostr:e});
  const challenge=c.encrypt('challenge',key,'ww_test');
  const response=await fetch(base+'?'+signed(challenge));assert.equal(response.status,200);assert.equal(await response.text(),'challenge');
  const wrong=c.encrypt('<xml><ToUserName>ww_test</ToUserName><AgentID>999</AgentID></xml>',key,'ww_test');
  assert.equal((await fetch(base+'?'+signed(wrong),{method:'POST',headers:{'Content-Type':'application/xml'},body:'<xml><Encrypt>'+wrong+'</Encrypt></xml>'})).status,403);
  const Link=require('../src/models/WecomAppLink'),Inbox=require('../src/models/WecomAppInbox'),Admin=require('../src/models/Admin'),Material=require('../src/models/WecomAppMaterial');
  const original=[Link.findOne,Inbox.updateOne,Admin.findById,Material.findOne];
  t.after(()=>{[Link.findOne,Inbox.updateOne,Admin.findById,Material.findOne]=original;delete process.env.WECOM_APP_INBOX_KEY;});
  process.env.WECOM_APP_INBOX_KEY=randomBytes(32).toString('hex');
  const stored=new Map();
  Link.findOne=async q=>q.userId==='staff_test'?{staffId:'staff1',tenantId:null}:null;
  Admin.findById=()=>({lean:async()=>({staffStatus:'active',role:'healthManager',tenantId:null})});
  Material.findOne=()=>({sort:async()=>null});
  Inbox.updateOne=async(filter,update)=>{if(!stored.has(filter.messageId))stored.set(filter.messageId,update.$setOnInsert);};
  const postText=async from=>{
    const plain=`<xml><ToUserName>ww_test</ToUserName><AgentID>123</AgentID><FromUserName>${from}</FromUserName><MsgType>text</MsgType><MsgId>123456</MsgId><Content><![CDATA[嘉医汇待办：核对测试预约]]></Content></xml>`;
    const encrypted=c.encrypt(plain,key,'ww_test');
    return fetch(base+'?'+signed(encrypted),{method:'POST',headers:{'Content-Type':'application/xml'},body:'<xml><Encrypt>'+encrypted+'</Encrypt></xml>'});
  };
  assert.equal((await postText('unknown')).status,200);assert.equal(stored.size,0);
  const accepted=await postText('staff_test');assert.equal(accepted.status,200);
  const reply=c.decrypt(c.field(await accepted.text(),'Encrypt'),key,'ww_test');assert.match(reply,/请先发送报告图片或PDF/);
  await postText('staff_test');assert.equal(stored.size,0);
});

test('复用员工应用时，微信客服事件在同一回调内分流且不要求 AgentID',async(t)=>{
  const names=['WECOM_APP_CALLBACK_ENABLED','WECOM_APP_CALLBACK_TOKEN','WECOM_APP_CALLBACK_AES_KEY','WECOM_CORP_ID','WECOM_AGENT_ID','WECOM_KF_ENABLED','WECOM_KF_USE_APP_CALLBACK','WECOM_KF_CORP_ID','WECOM_KF_SECRET','WECOM_KF_AI_ENABLED'];
  const before=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  t.after(()=>{for(const k of names){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}});
  Object.assign(process.env,{
    WECOM_APP_CALLBACK_ENABLED:'true',WECOM_APP_CALLBACK_TOKEN:'shared-token',
    WECOM_APP_CALLBACK_AES_KEY:randomBytes(32).toString('base64').slice(0,43),WECOM_CORP_ID:'ww_shared',WECOM_AGENT_ID:'123',
    WECOM_KF_ENABLED:'true',WECOM_KF_USE_APP_CALLBACK:'true',WECOM_KF_CORP_ID:'ww_shared',WECOM_KF_SECRET:'kf-secret',WECOM_KF_AI_ENABLED:'false',
  });
  const Cursor=require('../src/models/WecomKfCursor');
  const oldFindOne=Cursor.findOne,oldFetch=global.fetch;
  t.after(()=>{Cursor.findOne=oldFindOne;global.fetch=oldFetch;});
  Cursor.findOne=async()=>null;
  const calls=[];
  global.fetch=async(url,options)=>{calls.push({url:String(url),options});return {ok:true,json:async()=>String(url).includes('/gettoken?')?{access_token:'token'}:{errcode:0,msg_list:[]}};};
  const express=require('express'),app=express();app.use('/',require('../src/routes/wecomAppCallback'));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
  const key=process.env.WECOM_APP_CALLBACK_AES_KEY,time=String(Math.floor(Date.now()/1000)),nonce='shared';
  const plain='<xml><ToUserName><![CDATA[ww_shared]]></ToUserName><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[kf_msg_or_event]]></Event><OpenKfId><![CDATA[wk_shared]]></OpenKfId><Token><![CDATA[callback-token]]></Token></xml>';
  const encrypted=c.encrypt(plain,key,'ww_shared');
  const query=new URLSearchParams({timestamp:time,nonce,msg_signature:c.signature('shared-token',time,nonce,encrypted)});
  const base='http://127.0.0.1:'+server.address().port;
  const response=await oldFetch(base+'?'+query,{method:'POST',headers:{'Content-Type':'application/xml'},body:'<xml><Encrypt><![CDATA['+encrypted+']]></Encrypt></xml>'});
  assert.equal(await response.text(),'success');
  await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,2);assert.match(calls[1].url,/\/kf\/sync_msg/);assert.match(calls[1].options.body,/callback-token/);
});
