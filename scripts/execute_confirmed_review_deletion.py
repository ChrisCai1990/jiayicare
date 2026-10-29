"""Execute one user-confirmed synthetic demo request with deployed worker."""
import pathlib,sys
from ssh_config import connect
REMOTE=r'''
import pathlib,subprocess,json,os,time,urllib.request
base=pathlib.Path('/var/www/jiayicare-review/backend')
envfile='/var/www/jiayicare-secrets/review-backend.env'
def run(args,**kw):return subprocess.check_output(args,stderr=subprocess.PIPE,text=True,**kw).strip()
env={**os.environ,**json.loads(run(['node','-e',"console.log(JSON.stringify(require('dotenv').parse(require('fs').readFileSync(process.argv[1]))))",envfile],cwd=base))}
assert env.get('REVIEW_ENVIRONMENT')=='isolated'
check=r"""
const m=require('mongoose'),fs=require('fs'),path=require('path');
for(const f of fs.readdirSync('src/models').filter(f=>f.endsWith('.js')))require(path.resolve('src/models',f));
(async()=>{await m.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false});const db=m.connection.db;
if(db.databaseName!=='jiayicare_review')throw Error('WRONG_DATABASE');
const req=await db.collection('accountdeletionrequests').findOne({_id:new m.Types.ObjectId(process.argv[1])});
if(!req||req.status!=='requested')throw Error('NOT_REQUESTED');
const user=await db.collection('users').findOne({_id:req.user,tenantId:req.tenantId});
const tenant=await db.collection('tenants').findOne({_id:req.tenantId});
if(!user||user.name!=='演示体验用户'||user.phone||user.openid||!/^demo-[a-f0-9]{32}$/.test(tenant?.code||''))throw Error('NOT_SYNTHETIC_DEMO');
if(await db.collection('users').countDocuments({tenantId:req.tenantId})!==1)throw Error('NOT_SINGLE_DEMO');
const credentials=await db.collection('reviewcredentials').find({user:req.user}).toArray();
if(credentials.length!==1||!/^demo_[a-f0-9]{32}$/.test(credentials[0].username))throw Error('NOT_DEMO_CREDENTIAL');
const counts={};for(const n of ['orders','payments','refunds']){counts[n]=await db.collection(n).countDocuments({$or:[{user:req.user},{payerUser:req.user}]});if(counts[n])throw Error('DEMO_HAS_FINANCIAL_RECORDS')}
const reports=await db.collection('medicalreports').find({user:req.user}).toArray();
const keys=reports.flatMap(r=>r.ossKeys||[]);if(keys.some(k=>!/^reports\/demo-[a-f0-9]{32}\.png$/.test(k)))throw Error('NOT_OWNED_DEMO_FILES');
console.log(JSON.stringify({requestId:String(req._id),userId:String(req.user),tenantId:String(req.tenantId),files:keys,counts,healthRecords:await db.collection('healthrecords').countDocuments({user:req.user}),reports:reports.length}));await m.disconnect();
})().catch(e=>{console.error(e.message);process.exitCode=1});
"""
before=json.loads(run(['node','-e',check,REQUEST],cwd=base,env=env))
p=subprocess.run(['node','scripts/account-deletion-worker.js','execute',REQUEST],cwd=base,env=env,text=True,capture_output=True,timeout=300)
result={'requestId':REQUEST,'syntheticScope':before,'workerExit':p.returncode,'workerOutput':p.stdout[-1000:],'workerError':p.stderr[-1000:]}
lock=pathlib.Path(env['ACCOUNT_DELETION_MAINTENANCE_FILE']);result['maintenanceHeld']=lock.exists()
healthy=False
for _ in range(25):
 try:
  with urllib.request.urlopen('http://127.0.0.1:3108/api/health',timeout=2) as r:healthy=r.status==200
  if healthy:break
 except Exception:pass
 time.sleep(1)
result['health']=healthy
if p.returncode==0:
 verify=r"""
const m=require('mongoose'),fs=require('fs'),path=require('path');
(async()=>{await m.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false});const db=m.connection.db,b=JSON.parse(process.argv[1]),id=new m.Types.ObjectId(b.userId);const remaining={};
for(const n of ['users','reviewcredentials','loginsessions','healthrecords','medicalreports','messages'])remaining[n]=await db.collection(n).countDocuments(n==='users'?{_id:id}:{user:id});
const req=await db.collection('accountdeletionrequests').findOne({_id:new m.Types.ObjectId(b.requestId)});const keys=b.files.map(k=>({key:k,exists:fs.existsSync(path.join(process.env.UPLOADS_DIR,k))}));
console.log(JSON.stringify({status:req.status,completedAt:req.completedAt,completionScope:req.completionScope,evidencePresent:!!req.completionEvidence,remaining,files:keys}));await m.disconnect();
})().catch(()=>{console.error('VERIFICATION_FAILED');process.exitCode=1});
"""
 result['verification']=json.loads(run(['node','-e',verify,json.dumps(before)],cwd=base,env=env))
print(json.dumps(result))
'''
request=sys.argv[1];assert len(request)==24 and all(c in '0123456789abcdef' for c in request)
with connect() as c:
 i,o,e=c.exec_command('python3 -',timeout=360);i.write('REQUEST='+repr(request)+'\n'+REMOTE);i.channel.shutdown_write()
 output=o.read().decode();error=e.read().decode()
 if o.channel.recv_exit_status():raise RuntimeError(error[-1200:])
 print(output)
 pathlib.Path('release/apple-deletion-enable-20261029/demo-execution-'+request+'.json').write_text(output,encoding='utf-8')
