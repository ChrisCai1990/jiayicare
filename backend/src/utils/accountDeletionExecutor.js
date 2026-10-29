// Internal worker only. Never mount these methods on a customer completion endpoint.
const crypto=require('node:crypto');
const {canonical}=require('./accountDeletionInventory');
const {erasePersonalData}=require('./accountDeletionPersonalData');
const {auditResidualReferences}=require('./accountDeletionResidualAudit');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function fail(code){throw Object.assign(new Error(code),{code});}
async function prepareJob({jobs,request,manifest}) {
 if(!request?._id || !request.user || !request.tenantId || request.status==='completed') fail('INVALID_DELETION_REQUEST');
 if(String(request.user)!==manifest?.subject?.userId || String(request.tenantId)!==manifest.subject.tenantId || manifest.version!==1) fail('MANIFEST_IDENTITY_MISMATCH');
 if(manifest.blockers?.length || !Array.isArray(manifest.documents) || !Array.isArray(manifest.files)) fail('MANIFEST_REQUIRES_REVIEW');
 const immutable={...manifest,requestId:String(request._id),policyVersion:request.policyVersion};
 const hash=digest(immutable),scope={requestId:request._id};
 try {await jobs.updateOne(scope,{$setOnInsert:{...scope,userId:request.user,tenantId:request.tenantId,manifest:immutable,manifestHash:hash,state:'prepared',leaseToken:'',checkpoints:{},createdAt:new Date()}},{upsert:true});}
 catch(error){if(error.code!==11000)throw error;}
 const job=await jobs.findOne(scope);
 if(!job || job.manifestHash!==hash) fail('PERSISTED_MANIFEST_CHANGED');
 return job;
}
async function executeDeletion({jobs,requests,models,jobId,runtime,now=()=>new Date()}) {
 // All production adapters must exist BEFORE claiming or changing any customer data.
 for(const method of ['assertFrozen','verifyManifest','archiveFinancialData','eraseFiles','eraseOtherCopies','verifyCompletionScope','recordCompletion'])
  if(typeof runtime?.[method]!=='function') fail('EXECUTOR_ADAPTER_MISSING');
 const original=await jobs.findOne({_id:jobId});
 if(!original || digest(original.manifest)!==original.manifestHash) fail('JOB_MANIFEST_INVALID');
 if(original.state==='completed') return {completed:true,evidence:original.completionEvidence};
 const subject={userId:original.userId,tenantId:original.tenantId};
 const request=await requests.findOne({_id:original.requestId,user:subject.userId,tenantId:subject.tenantId});
 if(!request || request.policyVersion!==original.manifest.policyVersion) fail('REQUEST_CHANGED');
 if(request.status==='completed') {
  if(!original.completionEvidence || request.completionEvidence!==original.completionEvidence) fail('COMPLETION_EVIDENCE_MISMATCH');
  if(await models.User.collection.findOne({_id:subject.userId})) fail('ACCOUNT_IDENTITY_REMAINS');
  if(await runtime.assertFrozen(subject)!==true) fail('WRITER_FENCE_NOT_HELD');
  if((await runtime.recordCompletion({userId:subject.userId,tenantId:subject.tenantId,requestId:request._id,completionEvidence:request.completionEvidence,completedAt:request.completedAt},{fence:()=>runtime.assertFrozen(subject)}))?.verified!==true) fail('COMPLETION_LEDGER_UNVERIFIED');
  await jobs.updateOne({_id:jobId,completionEvidence:request.completionEvidence},{$set:{state:'completed',completedAt:request.completedAt,leaseToken:''}});
  return {completed:true,evidence:request.completionEvidence};
 }
 if(await runtime.assertFrozen(subject)!==true) fail('WRITER_FENCE_NOT_HELD');
 const token=crypto.randomBytes(32).toString('hex');
 const claimed=await jobs.updateOne({_id:jobId,manifestHash:original.manifestHash,state:{$in:['prepared','failed']},leaseToken:''},{$set:{state:'running',leaseToken:token,leaseStartedAt:now(),failureCode:''}});
 if(claimed.matchedCount!==1) fail('DELETION_WORKER_ALREADY_ACTIVE');
 const lease={_id:jobId,manifestHash:original.manifestHash,state:'running',leaseToken:token};
 async function fence(){
  if(await runtime.assertFrozen(subject)!==true || !await jobs.findOne(lease,{projection:{_id:1}})) fail('DELETION_FENCE_LOST');
  return true;
 }
 async function checkpoint(name,proof){
  await fence();
  if(!proof || proof.verified!==true) fail('STAGE_NOT_VERIFIED');
  const entry={verifiedAt:now(),proofHash:digest(proof)};
  const saved=await jobs.updateOne(lease,{$set:{['checkpoints.'+name]:entry}});
  if(saved.matchedCount!==1) fail('DELETION_FENCE_LOST');
 }
 try {
  await fence();
  if((await runtime.verifyManifest(original.manifest,{subject,fence,checkpoints:original.checkpoints||{},retry:original.state==='failed'}))?.verified!==true) fail('MANIFEST_NOT_VERIFIED');
  if((await requests.updateOne({_id:request._id,status:{$ne:'completed'}},{$set:{status:'processing'}})).matchedCount!==1) fail('REQUEST_CHANGED');
  // Adapters are idempotent and must reverify durable state even on a retry. A checkpoint
  // alone does not prove that a prior file deletion or encrypted archive is still valid.
  if((await jobs.updateOne(lease,{$set:{destructiveStartedAt:original.destructiveStartedAt||now()}})).matchedCount!==1) fail('DELETION_FENCE_LOST');
  for(const [stage,method] of [['finance','archiveFinancialData'],['files','eraseFiles'],['otherCopies','eraseOtherCopies']]) {
   await fence();const proof=await runtime[method](original.manifest,{subject,fence});await checkpoint(stage,proof);
  }
  const personal=await erasePersonalData({models,subject,assertReady:fence});
  await checkpoint('personalDatabase',{verified:true,...personal});
  await fence();
  const residual=await auditResidualReferences({models,subject});
  if(!residual.clear) fail('PERSONAL_REFERENCES_REMAIN');
  const external=await runtime.verifyCompletionScope(original.manifest,{subject,fence});
  if(external?.verified!==true) fail('EXTERNAL_ERASURE_UNVERIFIED');
  await checkpoint('externalVerification',external);
  await fence();
  const current=await models.User.collection.findOne({_id:subject.userId});
  if(current && String(current.tenantId)!==String(subject.tenantId)) fail('ACCOUNT_INSTITUTION_CHANGED');
  if(current) await models.User.collection.deleteOne({_id:subject.userId,tenantId:subject.tenantId});
  if(await models.User.collection.findOne({_id:subject.userId})) fail('ACCOUNT_IDENTITY_REMAINS');
  await checkpoint('identity',{verified:true,identityAbsent:true});
  // Verify again AFTER identity removal; a partial failure still must never show success.
  await fence();
  if(!(await auditResidualReferences({models,subject})).clear) fail('PERSONAL_REFERENCES_REMAIN');
  if((await runtime.verifyCompletionScope(original.manifest,{subject,fence}))?.verified!==true) fail('EXTERNAL_ERASURE_UNVERIFIED');
  const stored=await jobs.findOne(lease);
  const completionScope='account-and-active-data';
  const secondaryCleanup=external.external?.scope==='secondary-copy-followup-recorded' ? external.external.pending : [];
  const completionProof=original.completionProof || {jobId:String(jobId),requestId:String(request._id),manifestHash:original.manifestHash,checkpoints:stored.checkpoints,completionScope,secondaryCleanup,completedAt:now()};
  const completedAt=completionProof.completedAt;
  const evidence=digest(completionProof);
  if(original.completionEvidence && original.completionEvidence!==evidence) fail('COMPLETION_EVIDENCE_MISMATCH');
  // Persist the exact evidence before publishing the receipt so a crash between the
  // final two writes can be reconciled without repeating destructive stages.
  if((await jobs.updateOne(lease,{$set:{completionEvidence:evidence,completedAt,completionProof}})).matchedCount!==1) fail('DELETION_FENCE_LOST');
  // Independent restore ledger is durable BEFORE the public completed receipt.
  await fence();
  const recorded=await runtime.recordCompletion({userId:subject.userId,tenantId:subject.tenantId,requestId:request._id,completionEvidence:evidence,completedAt},{fence});
  if(recorded?.verified!==true) fail('COMPLETION_LEDGER_UNVERIFIED');
  // Both writes are idempotent; do not delete the receipt identity with the account.
  const done=await requests.updateOne({_id:request._id,user:subject.userId,tenantId:subject.tenantId,status:{$ne:'completed'}},{$set:{status:'completed',completedAt,completionEvidence:evidence,completionScope:completionProof.completionScope,secondaryCleanup:completionProof.secondaryCleanup}});
  if(done.matchedCount!==1) fail('COMPLETION_RECEIPT_WRITE_FAILED');
  const saved=await jobs.updateOne(lease,{$set:{state:'completed',completedAt,completionEvidence:evidence,leaseToken:''}});
  if(saved.matchedCount!==1) fail('JOB_COMPLETION_WRITE_FAILED');
  return {completed:true,evidence};
 } catch(error) {
  // Known worker failure releases only its own lease. A crashed worker keeps the lease,
  // preventing unsafe takeover until the process is proven dead by the operator.
  const code=/^[A-Z_]{3,80}$/.test(error.code||'')?error.code:'DELETION_EXECUTION_FAILED';
  await jobs.updateOne(lease,{$set:{state:'failed',failureCode:code,leaseToken:''}});
  await requests.updateOne({_id:request._id,status:{$ne:'completed'}},{$set:{status:'failed'}});
  throw error;
 }
}
module.exports={prepareJob,executeDeletion,digest};
