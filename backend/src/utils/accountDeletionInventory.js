// Read-only, raw-collection inventory: include soft-deleted rows and embedded snapshots.
// A file manifest is NOT authority to delete shared or unclassified objects.
const crypto = require('node:crypto');
const { buildOperations } = require('./accountDeletionPersonalData');
const fileFields = /^(?:fileUrls?|ossKeys?|imageUrls?|audioUrl|avatar|photoUrls?|attachmentUrl)$/i;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (value?.toHexString) return value.toHexString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])]));
  return value;
}
function validKey(raw) {
  if (!raw || raw.length > 1024 || raw.startsWith('/') || /[\\\x00-\x1f?#%]/.test(raw) || raw.split('/').some(p => !p || p==='.' || p==='..')) throw new Error('INVALID_STORAGE_REFERENCE');
  return raw;
}
function resolveReference(value, field, storage) {
  if (typeof value !== 'string' || !value.trim() || value.startsWith('data:')) return null;
  const text=value.trim(), isFileField=fileFields.test(field);
  if (/^ossKeys?$/i.test(field)) return { storage:'oss', key:validKey(text) };
  if (text.startsWith('/api/uploads/') && isFileField) return { storage:'local', key:validKey(decodeURIComponent(text.slice('/api/uploads/'.length))) };
  let url;
  try { url=new URL(text); } catch { return isFileField ? { storage:'unclassified', fingerprint:hash(text) } : null; }
  if (!['https:','http:'].includes(url.protocol)) return isFileField ? { storage:'unclassified', fingerprint:hash(text) } : null;
  // URL() normalizes traversal: reject it before trusting the normalized pathname.
  if (/\/(?:\.|%2e){1,2}(?:\/|%2f)/i.test(text) || /%2f|%5c/i.test(url.pathname)) throw new Error('INVALID_STORAGE_REFERENCE');
  if ((storage.ossOrigins||[]).includes(url.origin)) return { storage:'oss', key:validKey(decodeURIComponent(url.pathname.slice(1))) };
  if ((storage.uploadOrigins||[]).includes(url.origin) && url.pathname.startsWith('/api/uploads/')) return { storage:'local', key:validKey(decodeURIComponent(url.pathname.slice('/api/uploads/'.length))) };
  // External original (e.g. WeChat avatar) is not our storage. Remove our DB copy/reference,
  // never delete a third-party account or source object. Unknown internal hosts require review.
  return isFileField ? { storage:'external-reference', fingerprint:hash(text), origin:url.origin } : null;
}
function fileReferences(document, storage) {
  const found=new Map();
  function walk(value, field='') {
    if (value instanceof Date || value?.toHexString || Buffer.isBuffer(value)) return;
    if (Array.isArray(value)) { for(const item of value) walk(item,field); return; }
    if (value && typeof value==='object') { for(const [name,item] of Object.entries(value)) walk(item,name);return; }
    const file=resolveReference(value,field,storage);
    if(file) found.set(file.storage+':'+(file.key||file.fingerprint),file);
  }
  walk(document);return [...found.values()];
}
async function inventoryDeletion({ models, subject, storage, maxDocuments=100000 }) {
  const operations=buildOperations(models,subject).filter(op=>op.action==='delete');
  operations.push({name:'User',filter:{_id:subject.userId,tenantId:subject.tenantId}});
  const documents=[], objects=new Map(), blockers=[];
  let count=0;
  for(const op of operations) {
    const Model=models[op.name];
    for await(const document of Model.collection.find(op.filter)) {
      if(++count>maxDocuments) throw new Error('INVENTORY_LIMIT_REQUIRES_REVIEW');
      const source={model:op.name,collection:Model.collection.collectionName,id:String(document._id)};
      documents.push({...source,sha256:hash(JSON.stringify(canonical(document)))});
      try {
        for(const file of fileReferences(document,storage)) {
          const identity=file.storage+':'+(file.key||file.fingerprint);
          if(!objects.has(identity)) objects.set(identity,{...file,sources:[]});
          objects.get(identity).sources.push(source);
          if(file.storage==='unclassified') blockers.push({code:'UNCLASSIFIED_FILE',source});
        }
      } catch(error) { if(error.message!=='INVALID_STORAGE_REFERENCE') throw error;blockers.push({code:'INVALID_FILE',source}); }
    }
  }
  return {version:1,subject:{userId:String(subject.userId),tenantId:String(subject.tenantId)},documents,
    files:[...objects.values()],blockers,createdAt:new Date(),
    // Must separately inspect all persisted copies, readers/writers, backup lifecycle and shared references.
    executable:false};
}
async function findSharedFileReferences({ db, inventory, storage, maxDocuments=200000 }) {
  const owned=new Map(inventory.documents.map(d=>[d.collection+':'+d.id,d]));
  const candidates=new Set(inventory.files.filter(f=>['oss','local'].includes(f.storage)).map(f=>f.storage+':'+f.key));
  const shared=[];let scanned=0;
  if(!candidates.size) return {shared,scanned};
  for(const {name,type} of await db.listCollections({}, {nameOnly:false}).toArray()) {
    if(type!=='collection' || name.startsWith('system.')) continue;
    // Internal execution manifests only contain object locators; they are not independent copies.
    if(['accountdeletionjobs','accountdeletionrequests'].includes(name)) continue;
    for await(const document of db.collection(name).find({})) {
      if(++scanned>maxDocuments) throw new Error('REFERENCE_SCAN_LIMIT_REQUIRES_REVIEW');
      const operation=owned.get(name+':'+String(document._id));
      if(operation && operation.action!=='patch') continue;
      // Patching a mixed backup must not hide its retained siblings' attachments.
      const retained=operation?require('./accountDeletionLegacy').retainedLegacyDocument({document,item:operation,subject:inventory.subject}):document;
      for(const file of fileReferences(retained,storage)) {
        if(candidates.has(file.storage+':'+file.key)) shared.push({storage:file.storage,key:file.key,collection:name,id:String(document._id)});
      }
    }
  }
  return {shared,scanned};
}
module.exports={fileReferences,inventoryDeletion,findSharedFileReferences,canonical};
