const test=require('node:test'),assert=require('node:assert/strict');
const {deleteOssVersionsVerified,listExactVersions}=require('../src/utils/accountDeletionFiles');
function setup(){
 const file={storage:'oss',ownerId:'u',tenantId:'t',key:'reports/own.pdf',exclusive:true,disposition:'erase'};
 let rows=[{versionId:'v1',deleteMarker:false,etag:'hash1'},{versionId:'v2',deleteMarker:false,etag:'hash2'},{versionId:'d1',deleteMarker:true,etag:''}];
 const versions=structuredClone(rows),deleted=[];
 const client={async getBucketVersions(){return {res:{status:200},objects:rows.filter(r=>!r.deleteMarker).map(r=>({...r,name:file.key})).concat([{name:file.key+'.other',versionId:'foreign',etag:'other'}]),deleteMarker:rows.filter(r=>r.deleteMarker).map(r=>({...r,name:file.key})),isTruncated:false};},async delete(key,options){assert.equal(key,file.key);assert.ok(options.versionId);deleted.push(options.versionId);rows=rows.filter(r=>r.versionId!==options.versionId);},async head(){throw Object.assign(Error('missing'),{code:'NoSuchKey',status:404});}};
 return {input:{client,file,versions,subject:{userId:'u',tenantId:'t'},assertExclusive:async()=>true,assertFrozen:async()=>true},deleted,add:row=>rows.push(row)};
}
test('purges exact historical versions and delete markers, never a prefix neighbor',async()=>{
 const s=setup();assert.equal((await deleteOssVersionsVerified(s.input)).versionsErased,3);assert.deepEqual(s.deleted,['v1','v2','d1']);
 assert.equal((await deleteOssVersionsVerified(s.input)).versionsErased,0);
});
test('new/unplanned versions stop cleanup before any delete',async()=>{
 const s=setup();s.add({versionId:'new',deleteMarker:false,etag:'changed'});await assert.rejects(deleteOssVersionsVerified(s.input),/changed/);assert.equal(s.deleted.length,0);
});
test('version delete error cannot become a successful receipt',async()=>{
 const s=setup();s.input.client.delete=async()=>{throw Error('AccessDenied');};await assert.rejects(deleteOssVersionsVerified(s.input),/AccessDenied/);
});
test('pagination visits all exact versions and rejects repeated markers',async()=>{
 let calls=0;const client={async getBucketVersions(q){calls++;if(calls===1)return {res:{status:200},objects:[{name:'a',versionId:'old',etag:'h'}],deleteMarker:[],isTruncated:true,nextKeyMarker:'a',nextVersionIdMarker:'old'};
 assert.equal(q.versionIdMarker,'old');return {res:{status:200},objects:[],deleteMarker:[{name:'a',versionId:'d'}],isTruncated:false};}};
 assert.equal((await listExactVersions(client,'a')).length,2);
 const bad={getBucketVersions:async()=>({res:{status:200},objects:[],deleteMarker:[],isTruncated:true,nextKeyMarker:'a',nextVersionIdMarker:'v'})};
 await assert.rejects(listExactVersions(bad,'a'),/Repeated/);
});
test('fence loss between version deletions prevents completion',async()=>{
 const s=setup();let calls=0;s.input.assertFrozen=async()=>++calls<3;await assert.rejects(deleteOssVersionsVerified(s.input),/fence/);assert.deepEqual(s.deleted,['v1']);
});
