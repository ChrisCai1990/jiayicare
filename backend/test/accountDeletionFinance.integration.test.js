const test=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{mkdtempSync}=require('node:fs');
const {tmpdir}=require('node:os'),path=require('node:path'),{randomUUID,randomBytes}=require('node:crypto'),net=require('node:net'),mongoose=require('mongoose');
for(const name of ['Order','Payment','Refund','Admin','AccountDeletionFinancialArchive']) require('../src/models/'+name);
const {prepareFinancePlan,executeFinancePlan}=require('../src/utils/accountDeletionFinance');
const {openArchive}=require('../src/utils/accountDeletionFinancialArchive');
const oid=()=>new mongoose.Types.ObjectId();
test('finance stage with real isolated Mongo and synthetic transactions only', {skip:!process.env.TEST_MONGOD,timeout:90000},async t=>{
  const dbName = 'account_deletion_test_' + randomUUID().replaceAll('-', '');
  const directory = mkdtempSync(path.join(tmpdir(), 'account-deletion-test-'));
  const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const n = s.address().port; s.close(() => resolve(n)); }); });
  const server = spawn(process.env.TEST_MONGOD, ['--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', String(port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  // There is no application/worker using this private random database. That is the
  // test's real quiescence boundary; it is NOT a production write-freeze implementation.
  let isolated = false;
  t.after(async () => { isolated = false; await mongoose.disconnect(); server.kill(); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Isolated Mongo startup timeout')), 30000);
    server.once('error', e => { clearTimeout(timer); reject(e); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error('Mongo exited ' + code)); });
    server.stdout.on('data', data => { if (String(data).includes('Waiting for connections')) { clearTimeout(timer); resolve(); } });
    server.stderr.resume();
  });
  await mongoose.connect(`mongodb://127.0.0.1:${port}/${dbName}`, { autoIndex: false });
  isolated = true;


 const M=mongoose.models;
 await M.AccountDeletionFinancialArchive.init();
 const now=new Date(),encryptionKey=randomBytes(32).toString('base64');
 const ready=async()=>isolated && mongoose.connection.name===dbName && mongoose.connection.host==='127.0.0.1';
 async function fixture(){
  const subject={userId:oid(),tenantId:oid()},requestId=oid(),admin=oid(),order=oid(),payment=oid(),refund=oid();
  await M.Admin.collection.insertOne({_id:admin,tenantId:subject.tenantId,role:'superadmin',staffStatus:'active'});
  await M.Order.collection.insertOne({_id:order,user:subject.userId,tenantId:subject.tenantId,status:'completed',tradeStatus:'completed',paymentStatus:'paid',refundStatus:'none',paidAmount:100,healthProfile:{diagnosis:'private'},serviceName:'synthetic item'});
  await M.Payment.collection.insertOne({_id:payment,order,user:subject.userId,status:'succeeded',amount:100,channel:'offline',outTradeNo:'synthetic-'+payment,notifySnapshot:{private:'exclude'}});
  await M.Refund.collection.insertOne({_id:refund,order,payment,user:subject.userId,status:'succeeded',amount:10,totalAmount:100,outRefundNo:'synthetic-'+refund,reason:'private reason'});
  const classificationFor=async()=>({category:'tax_supporting_record',legalBasis:'synthetic test only',retainUntil:new Date('2037-01-01'),reviewedBy:admin,reviewedAt:now,fieldsVerified:true,originalsVerified:true});
  const prepare=()=>prepareFinancePlan({models:M,subject,requestId,classificationFor,keyId:'test',encryptionKey,now,env:{ACCOUNT_DELETION_FINANCE_ADMIN_IDS:String(admin)}});
  const execute=plan=>executeFinancePlan({models:M,subject,requestId,plan,encryptionKeys:{test:encryptionKey},assertFrozen:ready,objectId:id=>new mongoose.Types.ObjectId(id),now});
  return {subject,requestId,order,payment,refund,admin,prepare,execute};
 }
 await t.test('unfinished refunds and family payment are blocked without changing originals',async()=>{
  const f=await fixture();
  await M.Refund.collection.updateOne({_id:f.refund},{$set:{status:'processing'}});
  await assert.rejects(f.prepare(),{code:'UNFINISHED_TRANSACTION_REQUIRES_RESOLUTION'});
  assert.ok(await M.Order.collection.findOne({_id:f.order}));
  await M.Refund.collection.updateOne({_id:f.refund},{$set:{status:'succeeded'}});
  await M.Order.collection.updateOne({_id:f.order},{$set:{payerUser:oid()}});
  await assert.rejects(f.prepare(),{code:'SHARED_TRANSACTION_REQUIRES_RESOLUTION'});
 });
 await t.test('changed sources reject before any original removal',async()=>{
  const f=await fixture(),plan=await f.prepare();
  await M.Payment.collection.updateOne({_id:f.payment},{$set:{amount:99}});
  await assert.rejects(f.execute(plan),{code:'FINANCIAL_SOURCE_CHANGED'});
  for(const [name,id] of [['Order',f.order],['Payment',f.payment],['Refund',f.refund]])assert.ok(await M[name].collection.findOne({_id:id}));
 });
 await t.test('all archives verified before cleanup; interrupted deletion retries without loss',async()=>{
  const f=await fixture(),plan=await f.prepare();
  const original=M.Payment.collection.deleteOne;
  M.Payment.collection.deleteOne=async()=>{throw Error('simulated interruption');};
  try{await assert.rejects(f.execute(plan),/simulated interruption/);}finally{M.Payment.collection.deleteOne=original;}
  assert.equal(await M.AccountDeletionFinancialArchive.countDocuments({requestId:f.requestId}),3);
  assert.equal(await M.Refund.collection.findOne({_id:f.refund}),null);
  assert.ok(await M.Payment.collection.findOne({_id:f.payment}));
  const result=await f.execute(plan);assert.equal(result.verified,true);assert.equal(result.archives,3);
  assert.equal(await M.Order.collection.findOne({_id:f.order}),null);
  assert.equal(await M.Payment.collection.findOne({_id:f.payment}),null);
  const archived=await M.AccountDeletionFinancialArchive.find({requestId:f.requestId}).select('+ciphertext +iv +tag').lean();
  for(const entry of archived){assert.ok(entry.verifiedAt);const payload=openArchive(entry,encryptionKey);assert.equal(payload.healthProfile,undefined);assert.equal(payload.notifySnapshot,undefined);assert.equal(payload.reason,undefined);}
  assert.equal((await f.execute(plan)).verified,true);
 });
 await t.test('lost source without verified archive and missing write fence fail closed',async()=>{
  const f=await fixture(),plan=await f.prepare();
  await M.Refund.collection.deleteOne({_id:f.refund});
  await assert.rejects(f.execute(plan),{code:'MISSING_ORIGINAL_AND_VERIFIED_ARCHIVE'});
  assert.ok(await M.Order.collection.findOne({_id:f.order}));
  await assert.rejects(executeFinancePlan({models:M,subject:f.subject,requestId:f.requestId,plan,encryptionKeys:{test:encryptionKey},assertFrozen:async()=>false,objectId:id=>new mongoose.Types.ObjectId(id)}),{code:'WRITER_FENCE_NOT_HELD'});
 });
 await t.test('foreign-tenant reviewer cannot authorize retention',async()=>{
  const f=await fixture();await M.Admin.collection.updateOne({_id:f.admin},{$set:{tenantId:oid()}});
  await assert.rejects(f.prepare(),{code:'FINANCE_REVIEWER_UNVERIFIED'});
 });
});
