const {openArchive}=require('./accountDeletionFinancialArchive');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
function authorize(actor,env) {
 const allowed=new Set(String(env.ACCOUNT_DELETION_FINANCE_ADMIN_IDS||'').split(',').map(s=>s.trim()).filter(Boolean));
 if(!actor?._id || !actor.tenantId || actor.role!=='superadmin' || actor.staffStatus==='inactive' || !allowed.has(String(actor._id)))
   fail(403,'无注销财务归档查阅权限');
}
async function readFinancialArchive({actor,archiveId,purpose,reason,archives,audit,env=process.env,now=()=>new Date()}) {
 authorize(actor,env);
 if(!/^[a-f0-9]{24}$/.test(String(archiveId)) || !['tax','accounting','statutory_audit'].includes(purpose) || typeof reason!=='string' || reason.trim().length<4 || reason.length>500)
   fail(400,'请填写有效的查阅用途和原因');
 // The caller cannot choose a tenant. The acting admin's tenant scopes every read.
 const record=await archives.findOne({_id:archives.objectId(String(archiveId)),tenantId:actor.tenantId});
 if(!record || !record.verifiedAt) fail(404,'没有可查阅的财务归档');
 let keys;
 try{keys=JSON.parse(env.ACCOUNT_DELETION_ARCHIVE_KEYS||'{}');}catch{fail(503,'归档解密配置暂不可用');}
 const key=keys?.[record.keyId];
 if(typeof key!=='string') fail(503,'归档解密配置暂不可用');
 // A durable access log is a prerequisite to returning plaintext. Logging failures
 // must not be swallowed. The log contains no customer health data or plaintext payload.
 const entry={tenantId:actor.tenantId,archiveId:record._id,actorId:actor._id,purpose,reason:reason.trim(),accessedAt:now(),payloadHash:record.payloadHash};
 const saved=await audit.insertOne(entry);
 if(!saved?.acknowledged || !saved.insertedId) fail(503,'查阅审计未保存，请稍后重试');
 const persisted=await audit.findOne({_id:saved.insertedId,tenantId:actor.tenantId});
 if(!persisted || String(persisted.actorId)!==String(actor._id) || String(persisted.archiveId)!==String(record._id) || persisted.payloadHash!==record.payloadHash)
   fail(503,'查阅审计未确认，请稍后重试');
 const fields=openArchive(record,key);
 return {sourceType:record.sourceType,sourceId:String(record.sourceId),category:record.category,legalBasis:record.legalBasis,retainUntil:record.retainUntil,accountingYear:record.accountingYear??null,expiryAction:'appraisal_required',fields};
}
module.exports={authorize,readFinancialArchive};
