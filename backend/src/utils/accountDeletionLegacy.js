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
async function inventoryLegacyCopies({db, models, subject, inventory, storage, maxDocuments=200000}) {
  const userId=String(subject.userId), tenantId=String(subject.tenantId);
  if (!/^[a-f0-9]{24}$/.test(userId) || !/^[a-f0-9]{24}$/.test(tenantId)) fail('INVALID_LEGACY_SUBJECT');
  const registered=new Set(Object.values(models).map(model=>model.collection.collectionName));
  const identifiers=new Set([userId,...inventory.documents.filter(d=>d.model!=='User').map(d=>d.id)]);
  const documents=[], files=new Map(), blockers=[]; let scanned=0;
  for (const {name,type} of await db.listCollections({}, {nameOnly:false}).toArray()) {
    if (type!=='collection' || registered.has(name) || INTERNAL.has(name) || name.startsWith('system.')) continue;
    for await (const document of db.collection(name).find({})) {
      if (++scanned>maxDocuments) fail('LEGACY_SCAN_LIMIT_REQUIRES_REVIEW');
      if (!containsIdentifier(document, identifiers)) continue;
      const source={collection:name,id:String(document._id)};
      const path=OWNERS[name];
      if (!path || String(at(document,path))!==userId) {
        blockers.push({...source,code:'UNCLASSIFIED_HISTORICAL_COPY'}); continue;
      }
      // Older single-owner snapshots may omit tenantId. Global customer ObjectId
      // identifies ownership, but an explicit conflicting tenant always blocks.
      const tenantPaths=['tenantId','input.tenantId','snapshot.tenantId','original.tenantId'];
      if (tenantPaths.some(p=>at(document,p)!=null && String(at(document,p))!==tenantId)) {
        blockers.push({...source,code:'CROSS_TENANT_HISTORICAL_COPY'}); continue;
      }
      documents.push({...source,ownerPath:path,sha256:digest(document),action:'delete'});
      try {
        for (const file of fileReferences(document,storage)) {
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
    if(item.action!=='delete' || OWNERS[item.collection]!==item.ownerPath || !/^[a-f0-9]{24}$/.test(item.id)) fail('INVALID_LEGACY_OPERATION');
    if(await assertFrozen(subject)!==true) fail('LEGACY_FENCE_LOST');
    const document=await db.collection(item.collection).findOne({_id:objectId(item.id)});
    if(!document) continue; // Verified absence is safe on retry.
    if(String(at(document,item.ownerPath))!==String(subject.userId) || digest(document)!==item.sha256) fail('LEGACY_COPY_CHANGED');
    pending.push(item);
  }
  for(const item of pending) {
    if(await assertFrozen(subject)!==true) fail('LEGACY_FENCE_LOST');
    const collection=db.collection(item.collection);
    // The production writer fence must cover raw collection writers too.
    const result=await collection.deleteOne({_id:objectId(item.id)});
    if(result.deletedCount!==1) fail('LEGACY_DELETE_NOT_CONFIRMED');
    erased++;
  }
  for(const item of plan.documents) {
    if(await assertFrozen(subject)!==true) fail('LEGACY_FENCE_LOST');
    if(await db.collection(item.collection).findOne({_id:objectId(item.id)},{projection:{_id:1}})) fail('LEGACY_COPY_REMAINS');
  }
  return {verified:true,erased};
}
module.exports={inventoryLegacyCopies,eraseLegacyCopies,containsIdentifier};
