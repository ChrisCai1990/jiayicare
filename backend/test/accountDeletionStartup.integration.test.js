const test=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{mkdtempSync}=require('node:fs');
const fs=require('node:fs/promises'),{tmpdir}=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto'),net=require('node:net'),mongoose=require('mongoose');
test('real API starts only after database/ledger verification; restored account prevents listening', {skip:!process.env.TEST_MONGOD,timeout:240000},async t=>{
  const dbName = 'account_deletion_test_' + randomUUID().replaceAll('-', '');
  const directory = mkdtempSync(path.join(tmpdir(), 'account-deletion-test-'));
  const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const n = s.address().port; s.close(() => resolve(n)); }); });
  const server = spawn(process.env.TEST_MONGOD, ['--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', String(port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  // There is no application/worker using this private random database. That is the
  // test's real quiescence boundary; it is NOT a production write-freeze implementation.
  let isolated = false;
  t.after(async () => { isolated = false; await mongoose.disconnect(); server.kill(); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Isolated Mongo startup timeout')), 30000);
    server.once('error', e => { clearTimeout(timer); reject(e); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error('Mongo exited ' + code)); });
    server.stdout.on('data', data => { if (String(data).includes('Waiting for connections')) { clearTimeout(timer); resolve(); } });
    server.stderr.resume();
  });
  await mongoose.connect(`mongodb://127.0.0.1:${port}/${dbName}`, { autoIndex: false });
  isolated = true;


 const root=await fs.mkdtemp(path.join(tmpdir(),'deletion-api-startup-'));
 const ledger=path.join(root,'ledger.json'),lock=path.join(root,'maintenance.lock');
 await fs.writeFile(ledger,JSON.stringify({version:1,databaseName:dbName,entries:[]}));
 const trace=path.join(root,'trace.cjs');
 await fs.writeFile(trace,`const Module=require('node:module');const load=Module._load;Module._load=function(id,...args){const before=Date.now();if(id.startsWith('./routes/'))console.log('[test-boot] loading '+id);let result;try{result=load.call(this,id,...args);}catch(e){console.log('[test-boot] failed '+id+' '+(e.code==='MODULE_NOT_FOUND'?e.message:e.name));throw e;}if(id.startsWith('./routes/'))console.log('[test-boot] loaded '+id+' '+(Date.now()-before));return result;};`);
 const httpPort=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
 const env={PATH:process.env.PATH,NODE_PATH:process.env.NODE_PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,
  MONGODB_URI:`mongodb://127.0.0.1:${port}/${dbName}`,PORT:String(httpPort),NODE_ENV:'test',JWT_SECRET:'isolated-test-only',
  STARTUP_SCHEMA_WRITES_ENABLED:'false',STARTUP_BACKGROUND_JOBS_ENABLED:'false',ACCOUNT_DELETION_GUARD_ENABLED:'true',ACCOUNT_DELETION_LEDGER_FILE:ledger,ACCOUNT_DELETION_MAINTENANCE_FILE:lock};
 function start(){
  const child=spawn(process.execPath,['--require',trace,path.join(__dirname,'../src/index.js')],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',d=>{output=(output+String(d)).slice(-4000);});child.stderr.on('data',d=>{output=(output+String(d)).slice(-4000);});
  t.after(()=>child.kill());return {child,output:()=>output};
 }
 const normal=start();
 let healthy=false;
 for(let i=0;i<450;i++){
  if(normal.child.exitCode!==null)break;
  try{const response=await fetch(`http://127.0.0.1:${httpPort}/api/health`,{signal:AbortSignal.timeout(500)});if(response.ok){assert.equal((await response.json()).service,'jiayicare-backend');healthy=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 assert.equal(healthy,true,normal.output());
 const ended=new Promise(resolve=>normal.child.once('exit',resolve));normal.child.kill();await ended;
 const userId=new mongoose.Types.ObjectId(),requestId=new mongoose.Types.ObjectId(),tenantId=new mongoose.Types.ObjectId();
 await mongoose.connection.db.collection('users').insertOne({_id:userId,tenantId,phone:'synthetic-restored'});
 await fs.writeFile(ledger,JSON.stringify({version:1,databaseName:dbName,entries:[{userId:String(userId),tenantId:String(tenantId),requestId:String(requestId),completionEvidence:'a'.repeat(64),completedAt:new Date().toISOString()}]}));
 const restored=start();
 const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{restored.child.kill();reject(Error('startup guard timeout'));},30000);restored.child.once('exit',code=>{clearTimeout(timer);resolve(code);});});
 assert.equal(code,1,restored.output());assert.match(restored.output(),/DELETED_ACCOUNT_RESTORED/);
 await assert.rejects(fetch(`http://127.0.0.1:${httpPort}/api/health`,{signal:AbortSignal.timeout(1000)}));
});
