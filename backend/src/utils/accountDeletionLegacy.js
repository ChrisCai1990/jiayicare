// Historical raw collections are not covered by Mongoose delete hooks.
// Scan all of them before mutation; mixed financial/multi-person backups require
// explicit classification, never wholesale deletion based on one matching ID.
const crypto = require('node:crypto');
const {canonical, fileReferences} = require('./accountDeletionInventory');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const OWNERS = Object.freeze({
  annual_generation_snapshots: 'input.patientId',
  medicalreportmaintenancearchives: 'patientId',
  medicalservicecases: 'patientId',
  annual_plan_correction_backups: 'original.patientId',
});
const INTERNAL = new Set(['accountdeletionrequests', 'accountdeletionjobs', 'accountdeletionfinancialarchives']);
const at = (value, path) => path.split('.').reduce((v, k) => v?.[k], value);
function fail(code) { throw Object.assign(new Error(code), {code}); }
function containsIdentifier(value, ids) {
  if (value?.toHexString) return ids.has(value.toHexString());
  if (typeof value === 'string') return [...ids].some(id => value.includes(id));
  if (Array.isArray(value)) return value.some(item => containsIdentifier(item, ids));
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value))
    return Object.values(value).some(item => containsIdentifier(item, ids));
  return false;
}
// Only shapes observed in the maintenance collections are eligible. A reference
// to a deleted report is not enough to erase a document with unrelated payload.
const REPORT_KEYS = {
 maintenancebackups: new Set(['_id','jobId','entity','entityId','createdAt','before']),
 maintenance_audits: new Set(['_id','action','reportId','actor','at','sourceSha256','before','after']),
};
function classifyLegacy(name, document, subject, inventory) {
 const userId=String(subject.userId);
 if(OWNERS[name] && String(at(document,OWNERS[name]))===userId)
  return {action:'delete',ownerPath:OWNERS[name]};
 if(REPORT_KEYS[name]) {
  const ref=name==='maintenancebackups'?'entityId':'reportId';
  const report=inventory.documents.find(d=>d.model==='MedicalReport' && d.id===String(document[ref]));
  if(!report || (name==='maintenancebackups' && document.entity!=='medicalreports') ||
   Object.keys(document).some(k=>!REPORT_KEYS[name].has(k))) return null;
  if(document.before?._id!=null && String(document.before._id)!==report.id) return null;
  if(document.after?._id!=null && String(document.after._id)!==report.id) return null;
  if(['before.user','before.patientId','after.user','after.patientId'].some(p=>at(document,p)!=null && String(at(document,p))!==userId)) return null;
  return {action:'delete',ownerPath:ref,ownerDocument:{model:'MedicalReport',id:report.id}};
 }
 if(name==='codex_deletion_backups' && Array.isArray(document.documents) &&
  Object.keys(document).every(k=>['_id','kind','createdAt','documents'].includes(k))) {
  if(!document.documents.every(d=>d && /^[a-f0-9]{24}$/.test(String(d.patientId)))) return null;
  const removed=document.documents.filter(d=>String(d.patientId)===userId);
  if(!removed.length) return null;
  const identifiers=new Set([userId,...inventory.documents.filter(d=>d.action!=='patch').map(d=>d.id)]);
  const retained={...document,documents:document.documents.filter(d=>String(d.patientId)!==userId)};
  // A sibling with a reference to the applicant requires separate review.
  if(containsIdentifier(retained,identifiers)) return null;
  return {action:'patch',ownerPath:'documents[].patientId',afterSha256:digest(retained)};
 }
 return null;
}
function retainedLegacyDocument({document,item,subject}) {
 if(item.collection!=='codex_deletion_backups' || item.action!=='patch' ||
  item.ownerPath!=='documents[].patientId' || !Array.isArray(document.documents)) fail('INVALID_LEGACY_OPERATION');
 const actual=digest(document);
 if(actual===item.afterSha256) return document; // An already-applied operation is idempotent.
 if(actual!==item.sha256) fail('LEGACY_COPY_CHANGED');
 const retained={...document,documents:document.documents.filter(d=>String(d.patientId)!==String(subject.userId))};
 if(digest(retained)!==item.afterSha256 || retained.documents.length===document.documents.length) fail('INVALID_LEGACY_OPERATION');
 return retained;
}
function validateOwner(document,item,subject) {
 if(item.action==='patch') return retainedLegacyDocument({document,item,subject});
 if(item.action!=='delete') fail('INVALID_LEGACY_OPERATION');
 if(OWNERS[item.collection] && OWNERS[item.collection]===item.ownerPath) {
  if(String(at(document,item.ownerPath))!==String(subject.userId)) fail('LEGACY_COPY_CHANGED');
 } else {
  const classified=classifyLegacy(item.collection,document,subject,{documents:[item.ownerDocument||{}]});
  if(!classified || classified.ownerPath!==item.ownerPath || !item.ownerDocument) fail('INVALID_LEGACY_OPERATION');
 }
 if(digest(document)!==item.sha256) fail('LEGACY_COPY_CHANGED');
 return null;
}
async function inventoryLegacyCopies({db, models, subject, inventory, storage, maxDocuments=200000}) {
  const userId=String(subject.userId), tenantId=String(subject.tenantId);
  if (!/^[a-f0-9]{24}$/.test(userId) || !/^[a-f0-9]{24}$/.test(tenantId)) fail('INVALID_LEGACY_SUBJECT');
  const registered=new Set(Object.values(models).map(model=>model.collection.collectionName));
  const identifiers=new Set([userId,...inventory.documents.filter(d=>d.model!=='User' && d.action!=='patch').map(d=>d.id)]);
  const documents=[], files=new Map(), blockers=[]; let scanned=0;
  for (const {name,type} of await db.listCollections({}, {nameOnly:false}).toArray()) {
    if (type!=='collection' || registered.has(name) || INTERNAL.has(name) || name.startsWith('system.')) continue;
    for await (const document of db.collection(name).find({})) {
      if (++scanned>maxDocuments) fail('LEGACY_SCAN_LIMIT_REQUIRES_REVIEW');
      if (!containsIdentifier(document, identifiers)) continue;
      const source={collection:name,id:String(document._id)};
      const operation=classifyLegacy(name,document,subject,inventory);
      if (!operation) {
        blockers.push({...source,code:'UNCLASSIFIED_HISTORICAL_COPY'}); continue;
      }
      // Older single-owner snapshots may omit tenantId. Global customer ObjectId
      // identifies ownership, but an explicit conflicting tenant always blocks.
      const tenantPaths=['tenantId','input.tenantId','snapshot.tenantId','original.tenantId','before.tenantId','after.tenantId'];
      const ownedEntries=operation.action==='patch'?document.documents.filter(d=>String(d.patientId)===userId):[document];
      if ([document,...ownedEntries].some(row=>tenantPaths.some(p=>at(row,p)!=null && String(at(row,p))!==tenantId))) {
        blockers.push({...source,code:'CROSS_TENANT_HISTORICAL_COPY'}); continue;
      }
      documents.push({...source,...operation,sha256:digest(document)});
      try {
        for (const file of fileReferences(operation.action==='patch'?ownedEntries:document,storage)) {
          const identity=file.storage+':'+(file.key||file.fingerprint);
          if(!files.has(identity)) files.set(identity,{...file,sources:[]});
          files.get(identity).sources.push(source);
          if(file.storage==='unclassified') blockers.push({...source,code:'UNCLASSIFIED_HISTORICAL_FILE'});
        }
      } catch(error) {
        if(error.message!=='INVALID_STORAGE_REFERENCE') throw error;
        blockers.push({...source,code:'INVALID_HISTORICAL_FILE'});
      }
    }
  }
  return {documents,files:[...files.values()],blockers,scanned,
    scope:'unmodeled-identifier-linked-copies',
    limitation:'Offline backups, logs, provider copies, and text without an identifier require independent verification.'};
}
async function eraseLegacyCopies({db,subject,plan,assertFrozen,objectId}) {
  if(!Array.isArray(plan?.documents) || plan.blockers?.length || typeof assertFrozen!=='function' || typeof objectId!=='function') fail('LEGACY_PLAN_NOT_VERIFIED');
  let erased=0;
  // Preflight the WHOLE immutable plan before erasing any copy.
  const pending=[];
  for(const item of plan.documents) {
    if(!['delete','patch'].includes(item.action) || !/^[a-f0-9]{24}$/.test(item.id)) fail('INVALID_LEGACY_OPERATION');
    if(await assertFrozen(subject)!==true) fail('LEGACY_FENCE_LOST');
    const document=await db.collection(item.collection).findOne({_id:objectId(item.id)});
    if(!document) { if(item.action==='patch') fail('LEGACY_SHARED_COPY_MISSING'); continue; }
    const retained=validateOwner(document,item,subject);
    if(item.action==='patch' && digest(document)===item.afterSha256) continue;
    pending.push({item,document,retained});
  }
  for(const {item,document,retained} of pending) {
    if(await assertFrozen(subject)!==true) fail('LEGACY_FENCE_LOST');
    const collection=db.collection(item.collection);
    // The production writer fence must cover raw collection writers too.
    const compare={_id:document._id,$expr:{$eq:['$$ROOT',{$literal:document}]}};
    const result=item.action==='patch'?await collection.replaceOne(compare,retained):await collection.deleteOne(compare);
    if((item.action==='patch'?result.modifiedCount:result.deletedCount)!==1) fail('LEGACY_DELETE_NOT_CONFIRMED');
    erased++;
  }
  for(const item of plan.documents) {
    if(await assertFrozen(subject)!==true) fail('LEGACY_FENCE_LOST');
    const remaining=await db.collection(item.collection).findOne({_id:objectId(item.id)});
    if(item.action==='patch' ? !remaining || digest(remaining)!==item.afterSha256 : !!remaining) fail('LEGACY_COPY_REMAINS');
  }
  return {verified:true,erased};
}
module.exports={inventoryLegacyCopies,eraseLegacyCopies,containsIdentifier,retainedLegacyDocument};
