// Strict, deletion-specific OSS cleanup. Never call with browser-supplied keys.
// The caller must first freeze writes and build/verify an exclusive ownership manifest.
// The old oss.deleteFile intentionally swallows failures and is not suitable here.
function invalid(message) { throw Object.assign(new Error(message), { code: 'DELETION_FILE_UNVERIFIED' }); }
function validateFile(file, subject) {
  if (!subject?.userId || !subject.tenantId || !file || file.storage !== 'oss'
      || String(file.ownerId) !== String(subject.userId) || String(file.tenantId) !== String(subject.tenantId)
      || file.exclusive !== true || file.disposition !== 'erase') invalid('File ownership or deletion scope is unverified');
  const key = file.key;
  if (typeof key !== 'string' || key.length > 1024 || key.startsWith('/')
      || /[\\\x00-\x1f?#%]/.test(key) || key.split('/').some(segment => !segment || segment === '.' || segment === '..')) invalid('Invalid object key');
  return key;
}
async function deleteOssFileVerified({ client, file, subject, assertExclusive, assertFrozen }) {
  const key = validateFile(file, subject);
  if (typeof assertExclusive !== 'function' || typeof assertFrozen !== 'function') invalid('Ownership and write-fence checks are required');
  if (await assertFrozen(subject) !== true || await assertExclusive(file, subject) !== true) invalid('File may still be written or used by another record');
  const bucket = client?.options?.bucket;
  if (!bucket || typeof client.getBucketVersioning !== 'function') invalid('Bucket configuration is unknown');
  const versioning = await client.getBucketVersioning(bucket);
  if (versioning?.status !== 200 || !Object.prototype.hasOwnProperty.call(versioning, 'versionStatus')) invalid('Bucket versioning could not be verified');
  // Enabled and Suspended buckets can retain previous object versions after deletion.
  // Use deleteOssVersionsVerified for enabled/suspended buckets; never plain DELETE.
  if (![undefined, null, ''].includes(versioning.versionStatus)) invalid('Versioned bucket requires all-version cleanup');
  await client.delete(key); // propagate errors, including permissions, network failures and WORM retention
  try {
    await client.head(key);
  } catch (error) {
    if (error.code === 'NoSuchKey' && error.status === 404) {
      if (await assertFrozen(subject) !== true || await assertExclusive(file, subject) !== true) invalid('Ownership changed during cleanup');
      return { storage: 'oss', key, erased: true };
    }
    throw error; // NoSuchBucket, timeouts and access denial are not proof of deletion
  }
  invalid('Object remains accessible after deletion');
}

async function deleteLocalFileVerified({ root, file, subject, assertExclusive, assertFrozen }) {
  const fs = require('node:fs/promises'), path = require('node:path');
  // Reuse ownership and key validation; only the explicitly selected storage adapter differs.
  if(file?.storage!=='local') invalid('Not a local file');
  const key=validateFile({...file,storage:'oss'},subject);
  if(typeof assertExclusive!=='function' || typeof assertFrozen!=='function') invalid('Ownership and write-fence checks are required');
  const base=await fs.realpath(root), target=path.resolve(base,key);
  if(target===base || !target.startsWith(base+path.sep)) invalid('File outside upload root');
  if(await assertFrozen(subject)!==true || await assertExclusive(file,subject)!==true) invalid('File is not exclusively owned/frozen');
  let stat;
  try { stat=await fs.lstat(target); }
  catch(error) { if(error.code!=='ENOENT') throw error;return {storage:'local',key,erased:true,alreadyAbsent:true}; }
  if(!stat.isFile() || stat.isSymbolicLink()) invalid('Unexpected local file type');
  const real=await fs.realpath(target);
  if(real!==target || !real.startsWith(base+path.sep)) invalid('File resolves through a link');
  const {createHash}=require('node:crypto');
  if(!/^[a-f0-9]{64}$/.test(file.sha256||'') || createHash('sha256').update(await fs.readFile(target)).digest('hex')!==file.sha256) invalid('Local file differs from frozen manifest');
  if(await assertFrozen(subject)!==true || await assertExclusive(file,subject)!==true) invalid('File ownership changed');
  await fs.unlink(target);
  try {await fs.lstat(target);} catch(error) {
    if(error.code==='ENOENT' && await assertFrozen(subject)===true) return {storage:'local',key,erased:true};
    throw error;
  }
  invalid('Local file still exists');
}

async function listExactVersions(client,key) {
  if(typeof client.getBucketVersions!=='function') invalid('Version listing adapter unavailable');
  const versions=[],seen=new Set();let marker={};
  for(let page=0;page<1000;page++) {
    const result=await client.getBucketVersions({prefix:key,maxKeys:1000,...marker});
    if(result?.res?.status!==200 || typeof result.isTruncated!=='boolean' || !Array.isArray(result.objects) || !Array.isArray(result.deleteMarker)) invalid('Version listing is incomplete');
    for(const [rows,deleteMarker] of [[result.objects,false],[result.deleteMarker,true]]) for(const row of rows) {
      if(row.name!==key) continue; // Prefix matches must never delete another object's versions.
      if(typeof row.versionId!=='string' || !row.versionId || row.versionId.length>1024) invalid('Version identity unavailable');
      versions.push({versionId:row.versionId,deleteMarker,etag:row.etag||''});
    }
    if(!result.isTruncated) return versions;
    if(typeof result.nextKeyMarker!=='string' || !result.nextKeyMarker || typeof result.nextVersionIdMarker!=='string') invalid('Missing version pagination marker');
    const pair=JSON.stringify([result.nextKeyMarker,result.nextVersionIdMarker]);if(seen.has(pair)) invalid('Repeated version pagination marker');seen.add(pair);
    marker={keyMarker:result.nextKeyMarker,versionIdMarker:result.nextVersionIdMarker};
  }
  invalid('Version count requires manual review');
}
async function deleteOssVersionsVerified({client,file,subject,versions,assertExclusive,assertFrozen}) {
  const key=validateFile(file,subject);
  if(!Array.isArray(versions) || versions.length>100000 || typeof assertExclusive!=='function' || typeof assertFrozen!=='function') invalid('Persisted version manifest required');
  const planned=new Map();
  for(const row of versions) {
    if(typeof row.versionId!=='string' || !row.versionId || typeof row.deleteMarker!=='boolean' || planned.has(row.versionId)) invalid('Invalid persisted version manifest');
    planned.set(row.versionId,row);
  }
  async function fence(){if(await assertFrozen(subject)!==true || await assertExclusive(file,subject)!==true) invalid('Version deletion lost ownership/fence');}
  await fence();
  const current=await listExactVersions(client,key);
  for(const row of current) {
    const known=planned.get(row.versionId);
    if(!known || known.deleteMarker!==row.deleteMarker || known.etag!==row.etag) invalid('Object versions changed after manifest creation');
  }
  // Delete content versions before markers. Missing versions on retry remain safe;
  // a plain DELETE is never used because that would only append a delete marker.
  for(const row of [...current].sort((a,b)=>Number(a.deleteMarker)-Number(b.deleteMarker))) {
    await fence();await client.delete(key,{versionId:row.versionId});
  }
  await fence();
  if((await listExactVersions(client,key)).length) invalid('Historical object versions remain');
  try {await client.head(key);} catch(error) {
    if(error.code==='NoSuchKey' && error.status===404) {await fence();return {storage:'oss',key,erased:true,versionsErased:current.length};}
    throw error;
  }
  invalid('Current object remains after version cleanup');
}

async function listExactMultipartUploads(client,key) {
  if(typeof client.listUploads!=='function') invalid('Multipart listing adapter unavailable');
  const uploads=[],seen=new Set();let marker={};
  for(let page=0;page<1000;page++) {
    const result=await client.listUploads({prefix:key,'max-uploads':1000,...marker});
    if(result?.res?.status!==200 || typeof result.isTruncated!=='boolean' || !Array.isArray(result.uploads)) invalid('Multipart listing is incomplete');
    for(const row of result.uploads) {
      if(row.name!==key) continue;
      if(typeof row.uploadId!=='string' || !row.uploadId || row.uploadId.length>1024) invalid('Multipart identity unavailable');
      uploads.push({uploadId:row.uploadId});
    }
    if(!result.isTruncated) return uploads;
    if(typeof result.nextKeyMarker!=='string' || !result.nextKeyMarker || typeof result.nextUploadIdMarker!=='string') invalid('Missing multipart pagination marker');
    const pair=JSON.stringify([result.nextKeyMarker,result.nextUploadIdMarker]);
    if(seen.has(pair)) invalid('Repeated multipart pagination marker');seen.add(pair);
    marker={'key-marker':result.nextKeyMarker,'upload-id-marker':result.nextUploadIdMarker};
  }
  invalid('Multipart count requires manual review');
}
async function abortOssMultipartVerified({client,file,subject,uploads,assertExclusive,assertFrozen}) {
  const key=validateFile(file,subject);
  if(!Array.isArray(uploads) || uploads.length>100000 || typeof assertExclusive!=='function' || typeof assertFrozen!=='function') invalid('Persisted multipart manifest required');
  const planned=new Set();
  for(const row of uploads) {
    if(typeof row.uploadId!=='string' || !row.uploadId || planned.has(row.uploadId)) invalid('Invalid persisted multipart manifest');
    planned.add(row.uploadId);
  }
  async function fence(){if(await assertFrozen(subject)!==true || await assertExclusive(file,subject)!==true) invalid('Multipart cleanup lost ownership/fence');}
  await fence();
  const current=await listExactMultipartUploads(client,key);
  if(current.some(row=>!planned.has(row.uploadId))) invalid('Multipart uploads changed after manifest creation');
  for(const row of current) {
    await fence();
    // A dedicated cleanup client is required: ali-oss abort also cancels client-local
    // multipart work. Never share this instance with the application's upload client.
    try {await client.abortMultipartUpload(key,row.uploadId);}
    catch(error) {if(error.code!=='NoSuchUpload' || error.status!==404) throw error;}
  }
  await fence();
  if((await listExactMultipartUploads(client,key)).length) invalid('Multipart data remains');
  return {storage:'oss',key,verified:true,uploadsAborted:current.length};
}

module.exports = { listExactMultipartUploads, abortOssMultipartVerified, validateFile, deleteOssFileVerified, deleteLocalFileVerified, listExactVersions, deleteOssVersionsVerified };
