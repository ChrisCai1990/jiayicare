const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{tmpdir}=require('node:os'),{spawnSync}=require('node:child_process');
const {assertStartupAllowed,verifyRestoredDatabase}=require('../src/utils/accountDeletionStartupGuard');
const {acquireOfflineFence,assertOfflineFence,resumeStopping,releaseOfflineFence}=require('../src/utils/accountDeletionOfflineFence');
const {persistCompletionLedger}=require('../src/utils/accountDeletionLedger');
function fixture(){
 const root=fs.mkdtempSync(path.join(tmpdir(),'deletion-startup-test-'));
 const env={ACCOUNT_DELETION_GUARD_ENABLED:'true',ACCOUNT_DELETION_MAINTENANCE_FILE:path.join(root,'maintenance'),ACCOUNT_DELETION_LEDGER_FILE:path.join(root,'ledger')};
 fs.writeFileSync(env.ACCOUNT_DELETION_LEDGER_FILE,JSON.stringify({version:1,databaseName:'synthetic',entries:[]}));
 const writers=[{manager:'pm2',name:'jiayicare-backend',script:'/var/www/jiayicare/backend/src/index.js'},{manager:'pm2',name:'jiayicare-wecom-archive',script:'/var/www/jiayicare/backend/scripts/wecom-archive-worker.js'}];
 let stopped=false;const stoppedNames=[],startedNames=[];
 const inspect=()=>({states:writers.map(w=>({...w,pid:stopped?0:123,status:stopped?'stopped':'online',databaseHash:'a'.repeat(64),guardEnabled:true,lockFile:env.ACCOUNT_DELETION_MAINTENANCE_FILE,ledgerFile:env.ACCOUNT_DELETION_LEDGER_FILE})),direct:[],undeclared:[]});
 const args={env,writers,verifiedDatabaseHash:'a'.repeat(64),inspect,readCode:()=>"require('accountDeletionStartupGuard').assertStartupAllowed()",stop:w=>{assert.ok(fs.existsSync(env.ACCOUNT_DELETION_MAINTENANCE_FILE));stoppedNames.push(w.name);stopped=true;}};
 return {root,env,writers,args,inspect,stoppedNames,startedNames,start:w=>startedNames.push(w.name)};
}
test('disabled guard preserves current deployment; enabled guard requires explicit paths and ledger',async()=>{
 assert.equal(assertStartupAllowed({}),false);
 assert.throws(()=>assertStartupAllowed({ACCOUNT_DELETION_GUARD_ENABLED:'true'}),{code:'DELETION_GUARD_CONFIGURATION_INVALID'});
 const f=fixture();fs.unlinkSync(f.env.ACCOUNT_DELETION_LEDGER_FILE);
 await assert.rejects(verifyRestoredDatabase({env:f.env,db:{databaseName:'synthetic'}}),{code:'DELETION_LEDGER_UNREADABLE'});
});
test('empty or stale lock blocks actual API and archive worker processes before DB connect',()=>{
 const f=fixture();fs.writeFileSync(f.env.ACCOUNT_DELETION_MAINTENANCE_FILE,'');
 assert.throws(()=>assertStartupAllowed(f.env),{code:'DELETION_MAINTENANCE_ACTIVE'});
 for(const script of ['src/index.js','scripts/wecom-archive-worker.js']){
  const result=spawnSync(process.execPath,[path.join(__dirname,'..',script)],{env:{...process.env,...f.env,MONGODB_URI:'mongodb://127.0.0.1:1/never-connect'},timeout:15000,encoding:'utf8',windowsHide:true});
  assert.equal(result.status,1,script+': '+(result.error?.code || result.stderr));assert.match(result.stderr,/DELETION_MAINTENANCE_ACTIVE/);assert.doesNotMatch(result.stderr,/ECONNREFUSED/);
 }
});
test('coordinator writes restart lock before stopping both declared writers; release verifies ledger',async()=>{
 const f=fixture(),lease=acquireOfflineFence(f.args);
 assert.deepEqual(f.stoppedNames,f.writers.map(w=>w.name));
 assert.equal(assertOfflineFence({env:f.env,token:lease.token,inspect:f.inspect}),true);
 assert.throws(()=>assertStartupAllowed(f.env),{code:'DELETION_MAINTENANCE_ACTIVE'});
 await releaseOfflineFence({env:f.env,token:lease.token,inspect:f.inspect,db:{databaseName:'synthetic',collection:()=>({findOne:async()=>null})},start:f.start});
 assert.deepEqual(f.startedNames,f.stoppedNames);assert.equal(fs.existsSync(f.env.ACCOUNT_DELETION_MAINTENANCE_FILE),false);
});
test('omitted archive worker, missing installed guard, or undeclared same-database process prevents stop',()=>{
 for(const type of ['missing-worker','missing-code','undeclared','wrong-database']){
  const f=fixture(),args={...f.args};
  if(type==='missing-worker')args.writers=f.writers.slice(0,1);
  if(type==='missing-code')args.readCode=()=>'';
  if(type==='undeclared')args.inspect=()=>({...f.inspect(),undeclared:['another-worker']});
  if(type==='wrong-database')args.verifiedDatabaseHash='b'.repeat(64);
  assert.throws(()=>acquireOfflineFence(args));assert.equal(f.stoppedNames.length,0);assert.equal(fs.existsSync(f.env.ACCOUNT_DELETION_MAINTENANCE_FILE),false);
 }
});
test('a running or directly restarted writer and a changed token invalidate the fence',()=>{
 const f=fixture(),lease=acquireOfflineFence(f.args);
 assert.throws(()=>assertOfflineFence({env:f.env,token:'0'.repeat(64),inspect:f.inspect}),{code:'DELETION_FENCE_NOT_HELD'});
 assert.throws(()=>assertOfflineFence({env:f.env,token:lease.token,inspect:()=>({...f.inspect(),direct:[456]})}),{code:'DELETION_WRITER_STILL_RUNNING'});
 assert.throws(()=>assertOfflineFence({env:f.env,token:lease.token,inspect:()=>({...f.inspect(),remaining:[{pid:456,startTime:'old-child'}]})}),{code:'DELETION_WRITER_STILL_RUNNING'});
 assert.throws(()=>assertOfflineFence({env:f.env,token:lease.token,inspect:()=>({...f.inspect(),states:f.inspect().states.map(s=>({...s,pid:456}))})}),{code:'DELETION_WRITER_STILL_RUNNING'});
});
test('failed stop retains a recoverable lock and never claims quiescence',()=>{
 const f=fixture();assert.throws(()=>acquireOfflineFence({...f.args,stop:()=>{throw Error('stop failed');}}),/stop failed/);
 const saved=JSON.parse(fs.readFileSync(f.env.ACCOUNT_DELETION_MAINTENANCE_FILE));
 assert.equal(saved.state,'stopping');assert.match(saved.recoveryToken,/^[a-f0-9]{64}$/);
 assert.equal(resumeStopping({...f.args,token:saved.recoveryToken}).held,true);
 assert.throws(()=>assertStartupAllowed(f.env),{code:'DELETION_MAINTENANCE_ACTIVE'});
});
test('independent completion append is idempotent; restored identity prevents release and restart',async()=>{
 const f=fixture(),lease=acquireOfflineFence(f.args),entry={userId:'1'.repeat(24),tenantId:'2'.repeat(24),requestId:'3'.repeat(24),completionEvidence:'c'.repeat(64),completedAt:new Date()};
 const ready=()=>assertOfflineFence({env:f.env,token:lease.token,inspect:f.inspect});
 assert.equal((await persistCompletionLedger({env:f.env,databaseName:'synthetic',entry,assertFrozen:ready})).verified,true);
 assert.equal((await persistCompletionLedger({env:f.env,databaseName:'synthetic',entry,assertFrozen:ready})).alreadyRecorded,true);
 await assert.rejects(persistCompletionLedger({env:f.env,databaseName:'synthetic',entry:{...entry,completionEvidence:'d'.repeat(64)},assertFrozen:ready}),{code:'DELETION_LEDGER_CONFLICT'});
 const db={databaseName:'synthetic',collection:name=>({findOne:async()=>name==='users'?{_id:entry.userId}:null})};
 await assert.rejects(releaseOfflineFence({env:f.env,token:lease.token,inspect:f.inspect,db,objectId:id=>id,start:f.start}),{code:'DELETED_ACCOUNT_RESTORED'});
 assert.equal(f.startedNames.length,0);assert.ok(fs.existsSync(f.env.ACCOUNT_DELETION_MAINTENANCE_FILE));
});

test('partial destructive execution prevents unlocking even if no completed ledger entry exists',async()=>{
 const f=fixture(),lease=acquireOfflineFence(f.args);
 const db={databaseName:'synthetic',collection:name=>({findOne:async()=>name==='accountdeletionjobs'?{_id:'synthetic'}:null})};
 await assert.rejects(releaseOfflineFence({env:f.env,token:lease.token,inspect:f.inspect,db,start:f.start}),{code:'DELETION_EXECUTION_INCOMPLETE'});
 assert.equal(f.startedNames.length,0);assert.ok(fs.existsSync(f.env.ACCOUNT_DELETION_MAINTENANCE_FILE));
});
