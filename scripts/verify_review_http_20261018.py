"""One real bounded model request through deployed routes with disposable QA fixtures.
Only a loopback child process enables AI; the public service stays closed.
"""
import ast,json
from pathlib import Path
from ssh_config import connect
ROOT=Path(__file__).resolve().parents[1]
NODE=r'''
const assert=require('node:assert/strict'),mongoose=require('mongoose'),jwt=require('jsonwebtoken'),crypto=require('crypto');
const express=require('express');
(async()=>{
 const env=process.env;
 require('./src/utils/reviewEnvironment').assertReviewEnvironment();
 for(const k of ['REVIEW_EXTERNAL_SERVICES_ENABLED','REVIEW_AI_ENABLED','REVIEW_ASR_ENABLED'])assert.equal(env[k],'false');
 await mongoose.connect(env.MONGODB_URI,{autoIndex:false});
 require('./src/utils/reviewEnvironment').assertReviewConnection(mongoose.connection);
 env.REVIEW_EXTERNAL_SERVICES_ENABLED='true';env.REVIEW_AI_ENABLED='true';
 const User=require('./src/models/User'),Tenant=require('./src/models/Tenant'),Credential=require('./src/models/ReviewCredential'),Session=require('./src/models/LoginSession'),Consent=require('./src/models/AiDataConsent'),Message=require('./src/models/Message');
 const uid=new mongoose.Types.ObjectId(),tid=new mongoose.Types.ObjectId(),cid=new mongoose.Types.ObjectId(),sid=crypto.randomUUID();
 const budget=mongoose.connection.collection('reviewservicebudgets');
 const readBudget=async()=>(await budget.findOne({_id:'external-services'}))?.reservedFen||0;
 let server;
 const facts={syntheticOnly:true,publicServiceSwitchesChanged:false};
 try{
  await Tenant.collection.insertOne({_id:tid,name:'QA synthetic temporary',status:'active'});
  await User.collection.insertOne({_id:uid,tenantId:tid,name:'合成测试用户',isDeleted:false});
  await Credential.collection.insertOne({_id:cid,user:uid,username:'qa_'+crypto.randomUUID(),passwordHash:'not-a-login-credential',version:1,revokedAt:null,expiresAt:new Date(Date.now()+120000)});
  await Session.collection.insertOne({user:uid,sessionId:sid,logoutAt:null});
  const token=jwt.sign({id:String(uid),sessionId:sid,persistent:true,reviewAccount:String(cid),reviewVersion:1},env.JWT_SECRET,{expiresIn:120,issuer:'jiayicare-review',audience:'jiayicare-review'});
  const app=express();app.use(express.json());app.use('/api/ai-data-consent',require('./src/routes/aiDataConsent'));app.use('/api/messages',require('./src/routes/messages'));app.use((err,req,res,next)=>res.status(500).json({success:false}));
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port;
  const request=async(path,method='GET',body,authenticated=true)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});return{status:r.status,body:await r.json()};};
  assert.equal((await request('/api/ai-data-consent','GET',null,false)).status,401);
  const disclosure=await request('/api/ai-data-consent');assert.equal(disclosure.status,200);
  const d=disclosure.body.data.find(x=>x.purpose==='assistant');assert.equal(d.available,true);assert.equal(d.granted,false);
  assert.equal(disclosure.body.data.find(x=>x.purpose==='speech').available,false);
  facts.budgetBeforeFen=await readBudget();
  const send=()=>request('/api/messages','POST',{to:'doctor',content:'合成测试：请介绍一般科普中的BMI计算方法。'});
  assert.equal((await send()).status,200);await new Promise(r=>setTimeout(r,250));assert.equal(await readBudget(),facts.budgetBeforeFen);
  facts.unconsentedMessageDidNotCallAI=true;
  const update=(granted,revision,subjectId=String(uid))=>request('/api/ai-data-consent/assistant','PUT',{granted,revision,version:d.version,subjectId});
  assert.equal((await update(true,0,String(new mongoose.Types.ObjectId()))).status,409);
  assert.equal((await update(true,0)).status,200);
  assert.equal((await update(true,0)).status,409);
  assert.equal((await send()).status,200);
  let reply;
  for(let i=0;i<60;i++){reply=await Message.collection.findOne({user:uid,isAI:true});if(reply)break;await new Promise(r=>setTimeout(r,500));}
  assert.ok(reply,'AI reply absent');assert.ok(reply.references.some(r=>r.id==='who-bmi'));assert.ok(reply.sender.startsWith('AI'));
  facts.realReply={content:reply.content,sender:reply.sender,isAI:reply.isAI,references:reply.references};
  facts.budgetAfterFen=await readBudget();assert.equal(facts.budgetAfterFen,facts.budgetBeforeFen+10);
  assert.equal((await update(false,1)).status,200);
  assert.equal((await send()).status,200);await new Promise(r=>setTimeout(r,250));assert.equal(await readBudget(),facts.budgetAfterFen);
  assert.equal(await Message.collection.countDocuments({user:uid,isAI:true}),1);
  facts.revocationStopsNextMessage=true;facts.subjectAndRevisionChecksPassed=true;facts.passed=true;
 }finally{
  if(server)await new Promise(r=>server.close(r));
  for(const model of [Message,Consent,Credential,Session])await model.collection.deleteMany({user:uid});
  await User.collection.deleteOne({_id:uid});await Tenant.collection.deleteOne({_id:tid});
  await mongoose.disconnect();
 }
 console.log(JSON.stringify(facts));
})().catch(e=>{console.log(JSON.stringify({passed:false,reason:e.name==='AssertionError'?String(e.message).slice(0,160):'Review HTTP verification failed'}));process.exitCode=1;});
'''
# Reuse the audited remote launcher without importing its executable probe.
tree=ast.parse((ROOT/'scripts/verify_review_provider_20261018.py').read_text())
REMOTE=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='REMOTE' for t in n.targets))
with connect() as c:
    stdin,stdout,stderr=c.exec_command('python3 -',timeout=95)
    stdin.write(REMOTE.replace('NODE',repr(NODE)));stdin.channel.shutdown_write()
    out=stdout.read().decode();err=stderr.read().decode()
    if stdout.channel.recv_exit_status():raise RuntimeError(err[-1000:] or 'HTTP verification failed')
    facts=json.loads(out)
    (ROOT/'release/apple-review-20261018/review-http-after-recharge.json').write_text(json.dumps(facts,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(facts,ensure_ascii=False))
