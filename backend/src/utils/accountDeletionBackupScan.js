// Read-only verification of known backup roots. A matching/unknown file blocks
// automatic completion; this module never deletes a backup or rewrites originals.
const fs=require('node:fs/promises'),{createReadStream}=require('node:fs');
const path=require('node:path'),crypto=require('node:crypto'),{createGunzip}=require('node:zlib');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function fail(code){throw Object.assign(new Error(code),{code});}
function makePatterns({identifiers=[],textTokens=[]}) {
 const patterns=[];
 for(const id of new Set(identifiers.map(String))) {
  if(!/^[a-f0-9]{24}$/.test(id)) fail('BACKUP_IDENTIFIER_INVALID');
  patterns.push(Buffer.from(id),Buffer.from(id.toUpperCase()),Buffer.from(id,'hex'));
 }
 for(const text of new Set(textTokens)) {
  if(typeof text!=='string' || Buffer.byteLength(text)<6 || Buffer.byteLength(text)>4096) fail('BACKUP_TEXT_TOKEN_INVALID');
  patterns.push(Buffer.from(text));
  // JSON may escape Unicode. Check escaped spellings as well as UTF-8 bytes.
  const unicode=text.replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  if(unicode!==text) {patterns.push(Buffer.from(unicode));patterns.push(Buffer.from(unicode.replace(/\\u[0-9a-f]{4}/g,x=>x.toUpperCase().replace('U','u'))));}
 }
 if(!patterns.length) fail('BACKUP_PATTERNS_REQUIRED');
 return [...new Map(patterns.map(x=>[x.toString('hex'),x])).values()];
}
async function scanFile({file,patterns,maxExpandedBytes=2*1024*1024*1024}) {
 const before=await fs.lstat(file);
 if(!before.isFile() || before.isSymbolicLink()) fail('BACKUP_FILE_TYPE_UNVERIFIED');
 const format=file.toLowerCase();
 const gz=format.endsWith('.gz');
 if(!/\.(?:json|ejson|bson|archive|log|txt)(?:\.gz)?$/.test(format)) fail('BACKUP_FORMAT_UNSUPPORTED');
 const raw=createReadStream(file),compressedHash=crypto.createHash('sha256');
 // Hash exact stored bytes while matching decompressed bytes. A gzip error is
 // never treated as an empty backup, and the whole stream must reach EOF.
 raw.on('data',chunk=>compressedHash.update(chunk));
 let stream=raw;
 if(gz){stream=raw.pipe(createGunzip());raw.on('error',e=>stream.destroy(e));}
 if(!Array.isArray(patterns)||!patterns.length||patterns.length>50000||patterns.some(x=>!Buffer.isBuffer(x)||!x.length||x.length>4096))fail('BACKUP_PATTERNS_INVALID');
 const longest=patterns.reduce((n,x)=>Math.max(n,x.length),0);
 let tail=Buffer.alloc(0),expandedBytes=0;const hits=new Set();
 try {
  for await(const chunk of stream) {
   expandedBytes+=chunk.length;if(expandedBytes>maxExpandedBytes)fail('BACKUP_SCAN_LIMIT');
   const joined=Buffer.concat([tail,chunk]);
   for(const needle of patterns) if(joined.includes(needle))hits.add(hash(needle));
   tail=joined.subarray(Math.max(0,joined.length-longest+1));
  }
 } finally {raw.destroy();if(stream!==raw)stream.destroy();}
 const after=await fs.lstat(file);
 if(before.dev!==after.dev || before.ino!==after.ino || before.size!==after.size || before.mtimeMs!==after.mtimeMs || before.ctimeMs!==after.ctimeMs)fail('BACKUP_CHANGED_DURING_SCAN');
 return {sha256:compressedHash.digest('hex'),bytes:before.size,expandedBytes,matchedPatterns:hits.size,clear:hits.size===0};
}
async function scanBackupRoots({roots,patterns,assertFrozen,maxFiles=10000,maxExpandedBytes}) {
 if(!Array.isArray(roots)||!roots.length||!Array.isArray(patterns)||!patterns.length||typeof assertFrozen!=='function')fail('BACKUP_SCOPE_REQUIRED');
 const entries=[],seen=new Set(),snapshot=new Map();let count=0;
 const fingerprint=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs,stat.isDirectory()].join(':');
 async function fence(){if(await assertFrozen()!==true)fail('BACKUP_WRITER_FENCE_LOST');}
 async function visit(file,root) {
  await fence();const stat=await fs.lstat(file);snapshot.set(file,fingerprint(stat));
  if(stat.isSymbolicLink())fail('BACKUP_SYMLINK_REQUIRES_REVIEW');
  if(stat.isDirectory()) {for(const name of (await fs.readdir(file)).sort())await visit(path.join(file,name),root);return;}
  if(++count>maxFiles)fail('BACKUP_SCAN_LIMIT');
  const result=await scanFile({file,patterns,maxExpandedBytes});
  entries.push({rootHash:hash(root),pathHash:hash(file),...result});
 }
 for(const root of roots) {
  if(!path.isAbsolute(root) || path.resolve(root)===path.parse(path.resolve(root)).root)fail('BACKUP_ROOT_INVALID');
  const resolved=await fs.realpath(root);
  if(resolved!==path.resolve(root) || seen.has(resolved))fail('BACKUP_ROOT_INVALID');
  seen.add(resolved);await visit(resolved,resolved);
 }
 // Verify the entire tree again: a new, removed or changed backup invalidates
 // this pass even if that file changed after its individual scan completed.
 const after=new Map();
 async function verifyTree(file){const stat=await fs.lstat(file);if(stat.isSymbolicLink())fail('BACKUP_CHANGED_DURING_SCAN');after.set(file,fingerprint(stat));if(stat.isDirectory())for(const name of await fs.readdir(file))await verifyTree(path.join(file,name));}
 for(const root of seen)await verifyTree(root);
 if(after.size!==snapshot.size || [...snapshot].some(([file,stamp])=>after.get(file)!==stamp))fail('BACKUP_CHANGED_DURING_SCAN');
 await fence();
 return {version:1,scope:'explicit-local-backup-roots',verified:entries.every(x=>x.clear),entries,
  limitation:'Only the configured roots and supplied identifiers/text were scanned; this is not evidence of external/provider erasure.'};
}
module.exports={makePatterns,scanFile,scanBackupRoots};
