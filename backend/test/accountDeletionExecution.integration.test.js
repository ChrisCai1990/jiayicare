const test=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{mkdtempSync,readdirSync}=require('node:fs');
const fs=require('node:fs/promises'),{tmpdir}=require('node:os'),path=require('node:path');
const {randomUUID,randomBytes,createHash}=require('node:crypto'),net=require('node:net'),mongoose=require('mongoose');
for(const file of readdirSync(path.join(__dirname,'../src/models')).filter(f=>f.endsWith('.js'))) require(path.join(__dirname,'../src/models',file));
const {inventoryDeletion,findSharedFileReferences}=require('../src/utils/accountDeletionInventory');
const {prepareJob,executeDeletion,digest}=require('../src/utils/accountDeletionExecutor');
const {verifyDeletionManifest}=require('../src/utils/accountDeletionManifest');
const {prepareStorageManifest,createDeletionRuntime}=require('../src/utils/accountDeletionRuntime');
const {inventoryLegacyCopies,eraseLegacyCopies}=require('../src/utils/accountDeletionLegacy');
const {prepareFinancePlan,executeFinancePlan}=require('../src/utils/accountDeletionFinance');
const {persistCompletionLedger}=require('../src/utils/accountDeletionLedger');
const {verifyRestoredDatabase}=require('../src/utils/accountDeletionStartupGuard');
const {issueReceipt,readReceipt}=require('../src/utils/accountDeletionReceipt');
const oid=()=>new mongoose.Types.ObjectId();
test('real isolated execution deletes owned data/files and identity, preserving family; no production adapter claimed', {skip:!process.env.TEST_MONGOD,timeout:90000},async t=>{
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

 const M=mongoose.models, db=mongoose.connection.db;
 mongoose.model('ReviewCredential',new mongoose.Schema({user:{type:mongoose.Schema.Types.ObjectId,ref:'User'},passwordHash:String}));
 const subject={userId:oid(),tenantId:oid()},child=oid();
 const ready=async()=>isolated && mongoose.connection.name===dbName && mongoose.connection.host==='127.0.0.1';
 const root=await fs.mkdtemp(path.join(tmpdir(),'deletion-owned-files-'));
 const ledgerEnv={ACCOUNT_DELETION_POLICY_VERSION:'synthetic-v1',ACCOUNT_DELETION_GUARD_ENABLED:'true',ACCOUNT_DELETION_MAINTENANCE_FILE:path.join(root,'maintenance.lock'),ACCOUNT_DELETION_LEDGER_FILE:path.join(root,'ledger.json')};
 await fs.writeFile(ledgerEnv.ACCOUNT_DELETION_LEDGER_FILE,JSON.stringify({version:1,databaseName:dbName,entries:[]}));
 await fs.writeFile(path.join(root,'own.txt'),'synthetic own report');
 const fileHash=createHash('sha256').update('synthetic own report').digest('hex');
 const storage={uploadOrigins:['https://app.example'],ossOrigins:[]};
 const ownReport=oid(),childReport=oid();
 await M.User.collection.insertMany([{_id:subject.userId,tenantId:subject.tenantId,phone:'synthetic-parent'},{_id:child,tenantId:subject.tenantId,phone:'synthetic-child'}]);
 await M.ReviewCredential.collection.insertMany([{user:subject.userId,passwordHash:'synthetic-parent-only'},{user:child,passwordHash:'synthetic-child-only'}]);
 await M.MedicalReport.collection.insertMany([
  {_id:ownReport,user:subject.userId,tenantId:subject.tenantId,fileUrl:'https://app.example/api/uploads/own.txt',deletedAt:new Date()},
  {_id:childReport,user:child,tenantId:subject.tenantId,fileUrl:'https://external.example/child-original.pdf',submittedByUser:subject.userId},
 ]);
 await M.HealthRecord.collection.insertOne({_id:oid(),user:subject.userId,tenantId:subject.tenantId,value:'synthetic'});
 const request={_id:oid(),user:subject.userId,tenantId:subject.tenantId,status:'requested',policyVersion:'synthetic-v1',notice:'synthetic test only',completionDays:7,requestedAt:new Date(),receiptNonce:randomBytes(32).toString('hex'),receiptExpiresAt:new Date(Date.now()+86400000)};
 const requests=M.AccountDeletionRequest.collection,jobs=M.AccountDeletionJob.collection;
 await requests.insertOne(request);await jobs.createIndex({requestId:1},{unique:true});
 const legacyOwn=oid(),legacyChild=oid();
 await db.collection('medicalreportmaintenancearchives').insertMany([
  {_id:legacyOwn,patientId:subject.userId,snapshot:{fileUrl:'https://app.example/api/uploads/own.txt'}},
  {_id:legacyChild,patientId:child,snapshot:{fileUrl:'https://external.example/child-original.pdf'}},
 ]);
 const mixedId=oid(), reportBackupId=oid(), auditId=oid();
 const retainedReferral={_id:oid(),patientId:child,content:'synthetic sibling',attachedHealthInfo:{fileUrl:'https://external.example/sibling.pdf'}};
 await db.collection('codex_deletion_backups').insertOne({_id:mixedId,kind:'synthetic-only',documents:[{_id:oid(),patientId:subject.userId,content:'synthetic own'},retainedReferral]});
 await db.collection('maintenancebackups').insertOne({_id:reportBackupId,entity:'medicalreports',entityId:ownReport,before:{_id:ownReport,reportItems:[]}});
 await db.collection('maintenance_audits').insertOne({_id:auditId,reportId:ownReport,before:{user:subject.userId},after:{user:subject.userId}});
 const financeAdmin=oid(),financeOrder=oid(),financePayment=oid(),financeKey=randomBytes(32).toString('base64');
 await M.Admin.collection.insertOne({_id:financeAdmin,tenantId:subject.tenantId,role:'superadmin',staffStatus:'active'});
 await M.Order.collection.insertOne({_id:financeOrder,user:subject.userId,tenantId:subject.tenantId,status:'completed',tradeStatus:'completed',paymentStatus:'paid',refundStatus:'none',paidAmount:100});
 await M.Payment.collection.insertOne({_id:financePayment,order:financeOrder,user:subject.userId,status:'succeeded',amount:100,channel:'offline',outTradeNo:'synthetic-'+financePayment});
 const manifest=await prepareStorageManifest({db,models:M,subject,storage,localRoot:root,assertFrozen:ready});
 manifest.finance=await prepareFinancePlan({models:M,subject,requestId:request._id,keyId:'test',encryptionKey:financeKey,
  env:{ACCOUNT_DELETION_FINANCE_ADMIN_IDS:String(financeAdmin)},
  classificationFor:async()=>({category:'accounting_voucher',accountingYear:2026,legalBasis:'synthetic test only',retainUntil:new Date('2057-01-01'),reviewedBy:financeAdmin,reviewedAt:new Date(),fieldsVerified:true,originalsVerified:true})});
 const job=await prepareJob({jobs,request,manifest});
 await M.MedicalReport.collection.updateOne({_id:childReport},{$set:{fileUrl:'https://app.example/api/uploads/own.txt'}});
 const secret=randomBytes(32).toString('hex'),receipt=issueReceipt(request,secret);
 let failExternal=true,failFinalWrite=false,blockManifest=null;
 const tracked=require('../src/utils/accountDeletionFollowup').createSecondaryCopyFollowup({
  collection:db.collection('accountdeletionfollowups'),policyVersion:'synthetic-v1'});
 await db.collection('accountdeletionfollowups').createIndex({requestId:1,policyVersion:1,kind:1},{unique:true});
 const externalCopies={
  preflight:(...args)=>tracked.preflight(...args),
  erase:(...args)=>tracked.erase(...args),
  async verify(...args) {
   if(failExternal) throw Object.assign(new Error('injected storage verification failure'),{code:'STORAGE_VERIFICATION_FAILED'});
   return tracked.verify(...args);
  },
 };
 // No production data or provider was ever accessed by this private test database.
 const runtime=createDeletionRuntime({db,models:M,storage,localRoot:root,env:ledgerEnv,
  encryptionKeys:{test:financeKey},assertFrozen:ready,objectId:id=>new mongoose.Types.ObjectId(id),externalCopies});
 const verifyRuntimeManifest=runtime.verifyManifest;
 runtime.verifyManifest=async(plan,context)=>{
  await context.fence();if(blockManifest)await blockManifest;
  return verifyRuntimeManifest(plan,context);
 };
 const args={jobs,requests,models:M,jobId:job._id,runtime};
 await t.test('shared family attachment blocks before any destructive stage',async()=>{
  await assert.rejects(executeDeletion(args),{code:'SHARED_FILES_REMAIN'});
  assert.ok(await M.User.collection.findOne({_id:subject.userId}));await fs.access(path.join(root,'own.txt'));
  assert.ok(await M.MedicalReport.collection.findOne({_id:ownReport}));
 });
 // Change only the independent synthetic child fixture to exercise the exclusive-file path.
 await M.MedicalReport.collection.updateOne({_id:childReport},{$set:{fileUrl:'https://external.example/child-original.pdf'}});
 await t.test('runtime inventories real local file bytes and mixed historical copies',async()=>{
  const prepared=await prepareStorageManifest({db,models:M,subject,storage,localRoot:root,assertFrozen:ready});
  assert.equal(prepared.files.length,1);
  assert.equal(prepared.files[0].sha256,fileHash);
  assert.equal(prepared.files[0].exclusive,true);
  assert.ok(prepared.legacy.documents.some(row=>row.collection==='codex_deletion_backups'));
 });
 await t.test('a different empty upload root cannot falsely prove deletion on retry',async()=>{
  const wrongRoot=await fs.mkdtemp(path.join(tmpdir(),'deletion-wrong-root-'));
  const wrong=createDeletionRuntime({db,models:M,storage,localRoot:wrongRoot,env:ledgerEnv,
   encryptionKeys:{test:financeKey},assertFrozen:ready,objectId:id=>new mongoose.Types.ObjectId(id),externalCopies});
  await assert.rejects(executeDeletion({...args,runtime:wrong}),{code:'DELETION_STORAGE_SCOPE_CHANGED'});
  assert.ok(await M.Order.collection.findOne({_id:financeOrder}));
  await fs.access(path.join(root,'own.txt'));
 });
 await t.test('changed file blocks before archiving any financial original',async()=>{
  await fs.writeFile(path.join(root,'own.txt'),'synthetic changed file');
  await assert.rejects(executeDeletion(args),{code:'DELETION_STORAGE_CHANGED'});
  assert.ok(await M.Order.collection.findOne({_id:financeOrder}));
  assert.equal(await M.AccountDeletionFinancialArchive.countDocuments({requestId:request._id}),0);
  await fs.writeFile(path.join(root,'own.txt'),'synthetic own report');
 });
 await t.test('external preflight failure leaves the originals and account intact',async()=>{
  const preflight=externalCopies.preflight;
  externalCopies.preflight=async()=>({verified:false});
  try{await assert.rejects(executeDeletion(args),{code:'EXTERNAL_ERASURE_NOT_READY'});}
  finally{externalCopies.preflight=preflight;}
  assert.ok(await M.Order.collection.findOne({_id:financeOrder}));
  assert.ok(await M.User.collection.findOne({_id:subject.userId}));
  assert.equal(await M.AccountDeletionFinancialArchive.countDocuments({requestId:request._id}),0);
 });
 await t.test('new owned document after preparation blocks before finance or file deletion',async()=>{
  const added=oid();
  await M.HealthRecord.collection.insertOne({_id:added,user:subject.userId,tenantId:subject.tenantId,value:'synthetic late addition'});
  await assert.rejects(executeDeletion(args),{code:'DELETION_MANIFEST_NEW_SOURCE'});
  assert.ok(await M.Order.collection.findOne({_id:financeOrder}));
  assert.ok(await M.User.collection.findOne({_id:subject.userId}));
  await fs.access(path.join(root,'own.txt'));
  await M.HealthRecord.collection.deleteOne({_id:added});
 });
 await t.test('omitted file and changed owned source are detected by the real inventory verifier',async()=>{
  const verify=plan=>verifyDeletionManifest({db,models:M,subject,storage,plan,retry:true,assertFrozen:ready,objectId:id=>new mongoose.Types.ObjectId(id)});
  await assert.rejects(verify({...job.manifest,files:[]}),{code:'DELETION_MANIFEST_FILE_MISSING'});
  await M.MedicalReport.collection.updateOne({_id:ownReport},{$set:{reviewNote:'synthetic late edit'}});
  await assert.rejects(verify(job.manifest),{code:'DELETION_MANIFEST_SOURCE_CHANGED'});
  await M.MedicalReport.collection.updateOne({_id:ownReport},{$unset:{reviewNote:''}});
 });
 await t.test('exclusive worker claim rejects another worker; partial failure remains incomplete',async()=>{
  let release;blockManifest=new Promise(resolve=>{release=resolve;});
  const first=executeDeletion(args);
  for(let i=0;i<100;i++) {if((await jobs.findOne({_id:job._id})).state==='running')break;await new Promise(r=>setTimeout(r,5));}
  await assert.rejects(executeDeletion(args),{code:'DELETION_WORKER_ALREADY_ACTIVE'});release();blockManifest=null;
  await assert.rejects(first,{code:'STORAGE_VERIFICATION_FAILED'});
  assert.ok(await M.User.collection.findOne({_id:subject.userId}));
  assert.equal((await requests.findOne({_id:request._id})).status,'failed');
  assert.equal((await readReceipt({token:receipt.token,secret,requests:{findOne:q=>requests.findOne(q),objectId:id=>new mongoose.Types.ObjectId(id)}})).completedAt,null);
 });
 await t.test('retry verifies erasure, removes identity, recovers final receipt/job write failure',async()=>{
  failExternal=false;failFinalWrite=true;
  const wrapped={findOne:(...a)=>jobs.findOne(...a),async updateOne(query,update,...rest){
   if(failFinalWrite && update.$set?.state==='completed') {failFinalWrite=false;throw Error('simulated final database write failure');}
   return jobs.updateOne(query,update,...rest);
  }};
  await assert.rejects(executeDeletion({...args,jobs:wrapped}),/simulated final database write failure/);
  assert.equal(await M.User.collection.findOne({_id:subject.userId}),null);
  const result=await executeDeletion(args);assert.equal(result.completed,true);
  const status=await readReceipt({token:receipt.token,secret,requests:{findOne:q=>requests.findOne(q),objectId:id=>new mongoose.Types.ObjectId(id)}});
  assert.equal(status.status,'completed');assert.ok(status.completedAt);
  assert.equal(status.completionScope,'account-and-active-data');
  assert.deepEqual(status.secondaryCleanup,['backup','security_log','provider']);
  const followups=await db.collection('accountdeletionfollowups').find({requestId:String(request._id)}).toArray();
  assert.equal(followups.length,3);assert.ok(followups.every(row=>row.status==='pending'));
  // Account completion must never be represented as these secondary copies erased.
  assert.equal((await tracked.verify(job.manifest,{fence:ready})).allExternalErased,false);
  assert.equal((await jobs.findOne({_id:job._id})).state,'completed');
  assert.equal((await verifyRestoredDatabase({db,env:ledgerEnv,objectId:id=>new mongoose.Types.ObjectId(id)})).verified,1);
  assert.equal((await executeDeletion(args)).evidence,result.evidence);
  assert.equal(await M.MedicalReport.collection.findOne({_id:ownReport}),null);
  assert.equal(await M.ReviewCredential.collection.countDocuments({user:subject.userId}),0);
  assert.equal(await M.ReviewCredential.collection.countDocuments({user:child}),1);
  assert.equal(await M.Order.collection.findOne({_id:financeOrder}),null);
  assert.equal(await M.Payment.collection.findOne({_id:financePayment}),null);
  assert.equal(await M.AccountDeletionFinancialArchive.countDocuments({requestId:request._id}),2);
  assert.ok(await M.User.collection.findOne({_id:child}));
  assert.equal(await db.collection('medicalreportmaintenancearchives').findOne({_id:legacyOwn}),null);
  assert.ok(await db.collection('medicalreportmaintenancearchives').findOne({_id:legacyChild}));
  const kept=await M.MedicalReport.collection.findOne({_id:childReport});assert.ok(kept);assert.equal(kept.submittedByUser,undefined);
  assert.deepEqual((await db.collection('codex_deletion_backups').findOne({_id:mixedId})).documents,[retainedReferral]);
  assert.equal(await db.collection('maintenancebackups').findOne({_id:reportBackupId}),null);
  assert.equal(await db.collection('maintenance_audits').findOne({_id:auditId}),null);
 });
 await t.test('restored old identity or missing receipt blocks application startup',async()=>{
  await M.User.collection.insertOne({_id:subject.userId,tenantId:subject.tenantId,phone:'synthetic-restored'});
  await assert.rejects(verifyRestoredDatabase({db,env:ledgerEnv,objectId:id=>new mongoose.Types.ObjectId(id)}),{code:'DELETED_ACCOUNT_RESTORED'});
  await M.User.collection.deleteOne({_id:subject.userId});
  await requests.deleteOne({_id:request._id});
  await assert.rejects(verifyRestoredDatabase({db,env:ledgerEnv,objectId:id=>new mongoose.Types.ObjectId(id)}),{code:'DELETION_RECEIPT_RESTORED_OR_MISSING'});
 });
});
