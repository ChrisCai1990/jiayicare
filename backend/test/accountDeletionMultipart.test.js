const test=require('node:test'),assert=require('node:assert/strict');
const {abortOssMultipartVerified,listExactMultipartUploads}=require('../src/utils/accountDeletionFiles');
function fixture(){
 const file={storage:'oss',ownerId:'u',tenantId:'t',key:'reports/a.pdf',exclusive:true,disposition:'erase'};
 const rows=[{name:file.key,uploadId:'own'},{name:file.key+'.other',uploadId:'foreign'}],aborted=[];
 const client={listUploads:async()=>({res:{status:200},uploads:rows,isTruncated:false}),abortMultipartUpload:async(key,id)=>{assert.equal(key,file.key);aborted.push(id);rows.splice(rows.findIndex(r=>r.uploadId===id),1);}};
 return {rows,aborted,input:{client,file,subject:{userId:'u',tenantId:'t'},uploads:[{uploadId:'own'}],assertFrozen:async()=>true,assertExclusive:async()=>true}};
}
test('unfinished multipart data is erased only for exact planned key; retry is idempotent',async()=>{
 const f=fixture();assert.equal((await abortOssMultipartVerified(f.input)).uploadsAborted,1);assert.deepEqual(f.aborted,['own']);assert.equal(f.rows[0].uploadId,'foreign');
 assert.equal((await abortOssMultipartVerified(f.input)).uploadsAborted,0);
});
test('unplanned upload and permission failure block completion',async()=>{
 const f=fixture();f.rows.push({name:f.input.file.key,uploadId:'new'});
 await assert.rejects(abortOssMultipartVerified(f.input),/changed/);assert.equal(f.aborted.length,0);
 const g=fixture();g.input.client.abortMultipartUpload=async()=>{throw Object.assign(Error('AccessDenied'),{status:403});};
 await assert.rejects(abortOssMultipartVerified(g.input),/AccessDenied/);
});
test('pagination uses SDK wire query names and refuses repeated pages',async()=>{
 let calls=0;
 const client={listUploads:async q=>{if(++calls===1)return {res:{status:200},uploads:[],isTruncated:true,nextKeyMarker:'a',nextUploadIdMarker:'id'};
 assert.equal(q['key-marker'],'a');assert.equal(q['upload-id-marker'],'id');return {res:{status:200},uploads:[{name:'a',uploadId:'id2'}],isTruncated:false};}};
 assert.equal((await listExactMultipartUploads(client,'a'))[0].uploadId,'id2');
 const loop={listUploads:async()=>({res:{status:200},uploads:[],isTruncated:true,nextKeyMarker:'a',nextUploadIdMarker:'id'})};
 await assert.rejects(listExactMultipartUploads(loop,'a'),/Repeated/);
});
