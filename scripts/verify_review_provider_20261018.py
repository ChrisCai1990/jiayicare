"""One synthetic review model probe under the permanent shared CNY10 budget.
Service process switches remain off; no customer records are read.
"""
import json
from pathlib import Path
from ssh_config import connect
ROOT=Path(__file__).resolve().parents[1]
NODE=r'''
const assert=require('node:assert/strict'),mongoose=require('mongoose'),{randomUUID}=require('crypto');
const env=process.env;
const {assertReviewEnvironment,assertReviewConnection}=require('./src/utils/reviewEnvironment');
const {createReviewServiceBudget}=require('./src/utils/reviewServiceBudget');
const consent=require('./src/utils/aiDataConsent');
const Consent=require('./src/models/AiDataConsent');
const runtime=require('./src/utils/reviewRuntime');
(async()=>{
 assertReviewEnvironment();assert.equal(env.REVIEW_EXTERNAL_SERVICES_ENABLED,'false');assert.equal(env.REVIEW_AI_ENABLED,'false');assert.equal(env.REVIEW_ASR_ENABLED,'false');
 await mongoose.connect(env.MONGODB_URI,{autoIndex:false});assertReviewConnection(mongoose.connection);
 const collectionName='qa_budget_'+randomUUID().replaceAll('-','');let created=false,subject;
 const facts={syntheticOnly:true,serviceSwitchesChanged:false,providerRequests:0};
 try{
  assert.equal((await mongoose.connection.db.listCollections({name:collectionName}).toArray()).length,0);
  const ledger=mongoose.connection.collection(collectionName);created=true;
  const testEnv={...env,REVIEW_EXTERNAL_SERVICES_ENABLED:'true',REVIEW_AI_ENABLED:'true',REVIEW_ASR_ENABLED:'true',REVIEW_TOTAL_BUDGET_FEN:'20',REVIEW_DAILY_CALL_LIMIT:'25'};
  const connection={readyState:1,host:'127.0.0.1',port:27118,name:'jiayicare_review',collection:name=>{assert.equal(name,'reviewservicebudgets');return ledger;}};
  const reserve=createReviewServiceBudget({connection,env:testEnv});
  const results=await Promise.allSettled(Array.from({length:12},(_,i)=>reserve({service:i%2?'ai':'asr',maximumCostFen:10})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
  const row=await ledger.findOne({_id:'external-services'});assert.equal(row.reservedFen,20);
  await assert.rejects(createReviewServiceBudget({connection,env:testEnv})({service:'ai',maximumCostFen:10}));
  facts.mongoConcurrentBudgetPassed=true;
  await ledger.drop();created=false;
  // These switches exist in this one short-lived process only.
  env.REVIEW_EXTERNAL_SERVICES_ENABLED='true';env.REVIEW_AI_ENABLED='true';
  subject=new mongoose.Types.ObjectId();
  const payload={messages:[{role:'system',content:'You are processing only synthetic QA text. Output a strict JSON object with kind education and sourceIds ["who-bmi"] when asked for the BMI formula. No diagnosis or treatment.'},{role:'user',content:'合成测试：BMI的计算方法是什么？'}]};
  const services=runtime.services();
  const total=mongoose.connection.collection('reviewservicebudgets');
  facts.budgetBeforeFen=(await total.findOne({_id:'external-services'}))?.reservedFen||0;
  await assert.rejects(consent.withPersonalData(subject,'assistant',()=>services.ai.reply(payload)),{code:'AI_DATA_CONSENT_REQUIRED'});
  assert.equal((await total.findOne({_id:'external-services'}))?.reservedFen||0,facts.budgetBeforeFen);
  facts.deniedWithoutConsent=true;
  // Dedicated synthetic QA subject; never assigns consent to an existing user.
  await Consent.create({user:subject,purpose:'assistant',provider:'qwen',version:consent.VERSION,granted:true,revision:1,events:[{granted:true,version:consent.VERSION,actor:subject,at:new Date()}]});
  facts.providerRequests=1;
  try{
   const raw=await consent.withPersonalData(subject,'assistant',()=>services.ai.reply(payload));
   const answer=require('./src/utils/sourcedAssistantReply').formatReply(raw);
   facts.providerSucceeded=true;facts.formattedReply=answer;
   facts.hasVerifiedSource=answer.references.some(r=>r.id==='who-bmi');
  }catch(e){facts.providerSucceeded=false;facts.errorCode=/^[A-Z0-9_]{1,60}$/.test(e.code||'')?e.code:'REVIEW_PROVIDER_UNAVAILABLE';facts.providerReason=e.providerReason||'UNKNOWN';}
  facts.budgetAfterFen=(await total.findOne({_id:'external-services'})).reservedFen;
  assert.equal(facts.budgetAfterFen,facts.budgetBeforeFen+10);assert.ok(facts.budgetAfterFen<=1000);
  await Consent.updateOne({user:subject},{$set:{granted:false}});
  await assert.rejects(consent.withPersonalData(subject,'assistant',()=>services.ai.reply(payload)),{code:'AI_DATA_CONSENT_REQUIRED'});
  assert.equal((await total.findOne({_id:'external-services'})).reservedFen,facts.budgetAfterFen);
  facts.revocationStopsNextCall=true;
  console.log(JSON.stringify(facts));
 }finally{
  if(subject)await Consent.deleteMany({user:subject});
  if(created)await mongoose.connection.collection(collectionName).drop();
  await mongoose.disconnect();
 }
})().catch(()=>{console.log(JSON.stringify({failed:true,reason:'review probe assertion failed'}));process.exitCode=1;});
'''
REMOTE=r'''
import pathlib,subprocess,json
pid=subprocess.check_output(['systemctl','show','jiayicare-review-api','--property=MainPID','--value'],text=True).strip()
env=dict(x.split('=',1) for x in pathlib.Path('/proc/'+pid+'/environ').read_text().split('\0') if '=' in x)
assert env.get('REVIEW_ENVIRONMENT')=='isolated'
for key in ['REVIEW_EXTERNAL_SERVICES_ENABLED','REVIEW_AI_ENABLED','REVIEW_ASR_ENABLED']:assert env.get(key)=='false'
p=subprocess.run(['node','-'],input=NODE,text=True,capture_output=True,cwd='/var/www/jiayicare-review/backend',env=env,timeout=80)
lines=[line for line in p.stdout.splitlines() if line.startswith('{')]
if p.returncode or not lines:raise RuntimeError('Synthetic verification failed; no secrets printed')
print(lines[-1])
'''
with connect() as c:
    stdin,stdout,stderr=c.exec_command('python3 -',timeout=95)
    stdin.write(REMOTE.replace('NODE',repr(NODE)));stdin.channel.shutdown_write()
    out=stdout.read().decode();err=stderr.read().decode()
    if stdout.channel.recv_exit_status():raise RuntimeError(err[-1200:] or 'Verification failed')
    facts=json.loads(out);(ROOT/'release/apple-review-20261018/provider-probe.json').write_text(json.dumps(facts,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(facts,ensure_ascii=False))
