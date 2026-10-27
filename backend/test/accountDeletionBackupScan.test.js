const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{gzipSync}=require('node:zlib');
const {makePatterns,scanFile,scanBackupRoots}=require('../src/utils/accountDeletionBackupScan');
const id='a1b2c3d4e5f60718293a4b5c',patterns=makePatterns({identifiers:[id],textTokens:['synthetic@example.invalid','测试客户']});
const root=()=>fs.mkdtemp(path.join(os.tmpdir(),'deletion-backup-scan-'));
test('matches BSON raw ObjectId, extended JSON, escaped contact and cross-chunk bytes without returning personal content',async()=>{
 const dir=await root();
 for(const [name,bytes] of [['raw.archive',Buffer.concat([Buffer.alloc(65531),Buffer.from(id,'hex')])],['copy.ejson',Buffer.from(JSON.stringify({_id:{$oid:id}}))],['contact.json',Buffer.from('{"name":"\\u6d4b\\u8bd5\\u5ba2\\u6237"}')]]) {
  const file=path.join(dir,name);await fs.writeFile(file,bytes);const result=await scanFile({file,patterns});assert.equal(result.clear,false);assert.ok(result.matchedPatterns);assert.equal(JSON.stringify(result).includes(id),false);
 }
});
test('gzip reads every byte; corruption and expansion limits cannot certify absence',async()=>{
 const dir=await root(),file=path.join(dir,'copy.archive.gz');
 await fs.writeFile(file,gzipSync(Buffer.concat([Buffer.alloc(100000),Buffer.from(id,'hex')])));
 assert.equal((await scanFile({file,patterns})).clear,false);
 await assert.rejects(scanFile({file,patterns,maxExpandedBytes:100}),{code:'BACKUP_SCAN_LIMIT'});
 await fs.writeFile(file,Buffer.from('broken gzip'));await assert.rejects(scanFile({file,patterns}));
});
test('root verification requires real fence, rejects unsupported files, and reports matching backup as incomplete',async()=>{
 const dir=await root(),file=path.join(dir,'clear.json');await fs.writeFile(file,'{"synthetic":true}');
 const args={roots:[dir],patterns,assertFrozen:async()=>true};
 assert.equal((await scanBackupRoots(args)).verified,true);
 await fs.writeFile(path.join(dir,'matching.json'),JSON.stringify({user:id}));assert.equal((await scanBackupRoots(args)).verified,false);
 await assert.rejects(scanBackupRoots({...args,assertFrozen:async()=>false}),{code:'BACKUP_WRITER_FENCE_LOST'});
 await fs.writeFile(path.join(dir,'unknown.zip'),'unsupported');await assert.rejects(scanBackupRoots(args),{code:'BACKUP_FORMAT_UNSUPPORTED'});
});
