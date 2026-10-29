// Linux host coordinator. Not an HTTP endpoint. No background-job timeout is
// accepted as proof of quiescence; all declared writers must actually be stopped.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { configuration, verifyRestoredDatabase } = require('./accountDeletionStartupGuard');
const allowed = new Map([
 ['jiayicare-backend',['pm2','/var/www/jiayicare/backend/src/index.js']],
 ['jiayicare-wecom-archive',['pm2','/var/www/jiayicare/backend/scripts/wecom-archive-worker.js']],
 ['jiayicare-staging-backend',['pm2','/var/www/jiayicare-staging/backend/src/index.js']],
 ['jiayicare-review-api',['systemd','/var/www/jiayicare-review/backend/src/index.js']],
]);
function fail(code) { throw Object.assign(new Error(code), {code}); }
function validateWriters(writers) {
 if (!Array.isArray(writers) || !writers.length) fail('DELETION_WRITERS_UNVERIFIED');
 const seen=new Set();
 for(const writer of writers){
  const expected=allowed.get(writer.name);
  if(!expected || expected[0]!==writer.manager || expected[1]!==writer.script || seen.has(writer.name)) fail('DELETION_WRITERS_UNVERIFIED');
  seen.add(writer.name);
 }
 if(seen.has('jiayicare-backend')!==seen.has('jiayicare-wecom-archive')) fail('DELETION_WRITERS_UNVERIFIED');
}
function deploymentMetadata(script,pid,managerEnv={}) {
 const dotenv=require('dotenv');
 let fileEnv={};
 try{fileEnv=dotenv.parse(fs.readFileSync(path.join(path.dirname(script),'../.env')));}catch(error){if(error.code!=='ENOENT')throw error;}
 let initialEnv={};
 if(pid>0){
  try{initialEnv=Object.fromEntries(fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0').filter(v=>v.includes('=')).map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));}
  catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}
 }
 const effective={...fileEnv,...managerEnv,...initialEnv};
 let databaseHash=null;
 if(effective.MONGODB_URI){
  const client=new (require('mongoose').mongo.MongoClient)(effective.MONGODB_URI);
  databaseHash=crypto.createHash('sha256').update(JSON.stringify({hosts:client.options.hosts.map(h=>String(h)).sort(),database:client.db().databaseName,replicaSet:client.options.replicaSet||''})).digest('hex');
 }
 return {databaseHash,guardEnabled:effective.ACCOUNT_DELETION_GUARD_ENABLED==='true',lockFile:effective.ACCOUNT_DELETION_MAINTENANCE_FILE,ledgerFile:effective.ACCOUNT_DELETION_LEDGER_FILE};
}
function processIdentity(pid) {
 try {
  const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8');const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
  return {pid:Number(pid),parentPid:Number(fields[1]),startTime:fields[19]};
 }catch(error){if(['ENOENT','ESRCH'].includes(error.code))return null;throw error;}
}
function systemdConfiguration(name, run=execFileSync, readFile=fs.readFileSync) {
 const fields=Object.fromEntries(run('systemctl',['show',name,'--property=MainPID,ActiveState,EnvironmentFiles,Environment','--no-pager'],{encoding:'utf8'}).trim().split('\n').map(line=>{
  const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];
 }));
 // Read the persistent unit configuration even after its PID has exited.
 // Relevant inline overrides are not supported: require the explicit env file,
 // rather than guessing a shell/systemd escaping rule for connection secrets.
 if (/(?:^|[\s"])\b(?:MONGODB_URI|ACCOUNT_DELETION_[A-Z_]+)=/.test(fields.Environment||'')) fail('DELETION_SYSTEMD_INLINE_CONFIGURATION');
 const expression=/(\/[^\s;]+) \(ignore_errors=(?:yes|no)\)/g;
 const filenames=[...(fields.EnvironmentFiles||'').matchAll(expression)].map(match=>match[1]);
 if((fields.EnvironmentFiles||'').replace(expression,'').trim()) fail('DELETION_SYSTEMD_ENV_FILES_UNSUPPORTED');
 const environment=Object.assign({},...filenames.map(filename=>require('dotenv').parse(readFile(filename))));
 return {pid:Number(fields.MainPID),status:fields.ActiveState,environment};
}
function readHostState(writers,expectedHash,priorProcesses=[]) {
 if(process.platform!=='linux') fail('DELETION_HOST_UNSUPPORTED');
 const pm2=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8*1024*1024}));
 const states=writers.map(writer=>{
  if(writer.manager==='pm2'){
   const entries=pm2.filter(row=>row.name===writer.name);
   if(entries.length!==1 || entries[0].pm2_env.pm_exec_path!==writer.script) fail('DELETION_WRITER_CONFIGURATION_CHANGED');
   return {...writer,pid:entries[0].pid,status:entries[0].pm2_env.status,...deploymentMetadata(writer.script,entries[0].pid,entries[0].pm2_env)};
  }
  const unit=systemdConfiguration(writer.name);
  return {...writer,pid:unit.pid,status:unit.status,...deploymentMetadata(writer.script,unit.pid,unit.environment)};
 });
 // Track descendants as well as main PIDs: a PDF/OCR child can outlive its parent.
 const allProcesses=fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p)).map(processIdentity).filter(Boolean);
 const tracked=new Set(states.filter(s=>s.pid>0).map(s=>s.pid));
 let changed=true;
 while(changed){changed=false;for(const item of allProcesses)if(tracked.has(item.parentPid)&&!tracked.has(item.pid)){tracked.add(item.pid);changed=true;}}
 const processes=allProcesses.filter(item=>tracked.has(item.pid));
 const remaining=priorProcesses.filter(prior=>allProcesses.some(actual=>actual.pid===prior.pid && actual.startTime===prior.startTime));
 // Catch a direct restart outside PM2, including relative script arguments and node -e.
 const direct=[];
 for(const item of allProcesses){
  const pid=item.pid;if(pid===process.pid)continue;
  let command,cwd,executable;
  try{command=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');cwd=fs.readlinkSync('/proc/'+pid+'/cwd');executable=path.basename(fs.readlinkSync('/proc/'+pid+'/exe'));}
  catch(error){if(['ENOENT','ESRCH'].includes(error.code))continue;throw error;}
  const args=command.split('\0').filter(Boolean);
  const scriptMatch=writers.some(w=>command.includes(w.script) || args.some(arg=>arg.endsWith('.js') && path.resolve(cwd,arg)===w.script));
  const sameDatabase=/^(?:node|nodejs|python(?:\d+(?:\.\d+)*)?|mongosh|mongo|mongorestore)$/.test(executable)
    && deploymentMetadata(path.join(cwd,'scripts/unknown.js'),pid).databaseHash===expectedHash;
  if(scriptMatch || sameDatabase)direct.push(pid);
 }
 const undeclared=[];
 for(const row of pm2){
  const script=row.pm2_env?.pm_exec_path;
  if(!script || writers.some(w=>w.manager==='pm2' && w.name===row.name))continue;
  if(deploymentMetadata(script,row.pid,row.pm2_env).databaseHash===expectedHash)undeclared.push(row.name);
 }
 if(!writers.some(w=>w.name==='jiayicare-review-api')){
  const unit=systemdConfiguration('jiayicare-review-api');
  if(deploymentMetadata('/var/www/jiayicare-review/backend/src/index.js',unit.pid,unit.environment).databaseHash===expectedHash)undeclared.push('jiayicare-review-api');
 }
 return {states,direct,undeclared,processes,remaining};
}
function readLock(env,token,states=['stopped']){
 const config=configuration(env);
 if(!config || !/^[a-f0-9]{64}$/.test(token||''))fail('DELETION_FENCE_CONFIGURATION_INVALID');
 const stat=fs.lstatSync(config.lock);
 if(!stat.isFile() || stat.isSymbolicLink() || stat.size>65536)fail('DELETION_FENCE_INVALID');
 const lock=JSON.parse(fs.readFileSync(config.lock,'utf8'));
 if(lock.version!==1 || lock.tokenHash!==crypto.createHash('sha256').update(token).digest('hex') || !states.includes(lock.state))fail('DELETION_FENCE_NOT_HELD');
 validateWriters(lock.writers);
 return lock;
}
function assertOfflineFence({env=process.env,token,inspect=readHostState}){
 const lock=readLock(env,token);
 const actual=inspect(lock.writers,lock.verifiedDatabaseHash,lock.processes||[]);
 if(actual.undeclared?.length || actual.states.some(s=>s.databaseHash!==lock.verifiedDatabaseHash || !s.guardEnabled || s.lockFile!==env.ACCOUNT_DELETION_MAINTENANCE_FILE || s.ledgerFile!==env.ACCOUNT_DELETION_LEDGER_FILE))fail('DELETION_WRITERS_UNVERIFIED');
 if(actual.direct.length || actual.remaining?.length || actual.states.length!==lock.writers.length || actual.states.some(row=>row.pid>0 || !['stopped','inactive','failed'].includes(row.status)))fail('DELETION_WRITER_STILL_RUNNING');
 // Re-read after checking processes, rejecting an operator replacing/removing the lock.
 const again=readLock(env,token);
 if(JSON.stringify(lock)!==JSON.stringify(again))fail('DELETION_FENCE_CHANGED');
 return true;
}
function acquireOfflineFence({env=process.env,writers,verifiedDatabaseHash,inspect=readHostState,stop,readCode=script=>fs.readFileSync(script,'utf8')}){
 const config=configuration(env);validateWriters(writers);
 if(!config || !/^[a-f0-9]{64}$/.test(verifiedDatabaseHash||''))fail('DELETION_WRITERS_UNVERIFIED');
 // All identities/configurations must be checked before stopping even the first process.
 const before=inspect(writers,verifiedDatabaseHash);
 if(before.undeclared?.length || before.states.some(s=>s.databaseHash!==verifiedDatabaseHash || !s.guardEnabled || s.lockFile!==config.lock || s.ledgerFile!==config.ledger))fail('DELETION_WRITERS_UNVERIFIED');
 if(before.states.length!==writers.length)fail('DELETION_WRITERS_UNVERIFIED');
 for(const writer of writers){
  const text=readCode(writer.script);
  if(!text.includes('accountDeletionStartupGuard') || !text.includes('assertStartupAllowed'))fail('DELETION_STARTUP_GUARD_MISSING');
 }
 const token=crypto.randomBytes(32).toString('hex');
 const lock={version:1,state:'stopping',recoveryToken:token,tokenHash:crypto.createHash('sha256').update(token).digest('hex'),writers,verifiedDatabaseHash,processes:before.processes||[],createdAt:new Date().toISOString()};
 const handle=fs.openSync(config.lock,'wx',0o600);
 try{fs.writeFileSync(handle,JSON.stringify(lock));fs.fsyncSync(handle);}finally{fs.closeSync(handle);}
 // No automatic unlock on failure: a crash must leave both application starts blocked.
 const stopWriter=stop || (writer=>execFileSync(writer.manager==='pm2'?'pm2':'systemctl',['stop',writer.name],{stdio:'pipe'}));
 for(const writer of writers)stopWriter(writer);
 const after=inspect(writers,verifiedDatabaseHash,lock.processes);
 if(after.direct.length || after.remaining?.length || after.states.some(row=>row.pid>0 || !['stopped','inactive','failed'].includes(row.status)))fail('DELETION_WRITER_STILL_RUNNING');
 lock.state='stopped';
 const update=fs.openSync(config.lock,'r+');
 try{fs.ftruncateSync(update,0);fs.writeFileSync(update,JSON.stringify(lock));fs.fsyncSync(update);}finally{fs.closeSync(update);}
 assertOfflineFence({env,token,inspect});
 return {token,writers,verifiedDatabaseHash};
}
function resumeStopping({env=process.env,token,inspect=readHostState,stop}) {
 const lock=readLock(env,token,['stopping']);
 const config=configuration(env),before=inspect(lock.writers,lock.verifiedDatabaseHash,lock.processes||[]);
 if(before.undeclared?.length || before.states.some(s=>s.databaseHash!==lock.verifiedDatabaseHash || !s.guardEnabled || s.lockFile!==config.lock || s.ledgerFile!==config.ledger))fail('DELETION_WRITERS_UNVERIFIED');
 const stopWriter=stop || (writer=>execFileSync(writer.manager==='pm2'?'pm2':'systemctl',['stop',writer.name],{stdio:'pipe'}));
 for(const writer of lock.writers)stopWriter(writer);
 const after=inspect(lock.writers,lock.verifiedDatabaseHash,lock.processes||[]);
 if(after.direct.length || after.remaining?.length || after.states.some(row=>row.pid>0 || !['stopped','inactive','failed'].includes(row.status)))fail('DELETION_WRITER_STILL_RUNNING');
 lock.state='stopped';
 const handle=fs.openSync(config.lock,'r+');
 try{fs.ftruncateSync(handle,0);fs.writeFileSync(handle,JSON.stringify(lock));fs.fsyncSync(handle);}finally{fs.closeSync(handle);}
 assertOfflineFence({env,token,inspect});return {held:true};
}
async function releaseOfflineFence({env=process.env,token,db,objectId,inspect=readHostState,start}) {
 assertOfflineFence({env,token,inspect});
 const lock=readLock(env,token);
 // Check the durable independent ledger against the database before allowing restart.
 await verifyRestoredDatabase({env,db,objectId,maintenanceToken:token});
 assertOfflineFence({env,token,inspect});
 fs.unlinkSync(configuration(env).lock);
 const startWriter=start || (writer=>execFileSync(writer.manager==='pm2'?'pm2':'systemctl',['start',writer.name],{stdio:'pipe'}));
 for(const writer of lock.writers)startWriter(writer);
 return {released:true,writers:lock.writers.map(w=>w.name)};
}
module.exports={validateWriters,systemdConfiguration,readHostState,assertOfflineFence,acquireOfflineFence,resumeStopping,releaseOfflineFence};
