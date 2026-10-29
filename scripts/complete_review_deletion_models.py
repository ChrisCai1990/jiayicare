"""Add missing schema definitions from deployed production; no business routes."""
import pathlib
from ssh_config import connect
REMOTE=r'''
import pathlib,subprocess,json,os,time,urllib.request
prod=pathlib.Path('/var/www/jiayicare/backend');base=pathlib.Path('/var/www/jiayicare-review/backend')
names=['AIHealthCheckupReview','AnnualManagementDecision','MdtPacket','NutritionAssessmentRequest','ResearchCandidate','WeightProgressPhoto']
files=['src/models/'+n+'.js' for n in names]
for rel in ['src/utils/patientTenantFence.js','src/utils/tenantScope.js']:
 assert (base/rel).is_file(),'Required existing tenant adapter missing'
assert all(not (base/r).exists() for r in files),'Review models changed'
added=[]
try:
 for rel in files:
  data=(prod/rel).read_bytes();dest=base/rel
  subprocess.run(['node','--check',str(prod/rel)],check=True,capture_output=True)
  dest.write_bytes(data);dest.chmod(0o644);added.append(dest)
 code=r"""
require('dotenv').config({path:'/var/www/jiayicare-secrets/review-backend.env'});
const fs=require('fs'),path=require('path'),m=require('mongoose');
(async()=>{
for(const f of fs.readdirSync('src/models').filter(f=>f.endsWith('.js')))require(path.resolve('src/models',f));
const ops=require('./src/utils/accountDeletionPersonalData').buildOperations(m.models,{userId:new m.Types.ObjectId(),tenantId:new m.Types.ObjectId()});
await m.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false});
for(const [name,key] of [['accountdeletionrequests',{tenantId:1,user:1}],['accountdeletionjobs',{requestId:1}],['accountdeletionfinancialarchives',{tenantId:1,requestId:1,sourceType:1,sourceId:1}],['accountdeletionfollowups',{requestId:1,policyVersion:1,kind:1}]])await m.connection.db.collection(name).createIndex(key,{unique:true});
console.log(JSON.stringify({operations:ops.length,indexesVerified:true}));await m.disconnect();
})().catch(e=>{console.error(JSON.stringify({code:e.code||e.name,message:e.message.slice(0,200)}));process.exitCode=1});
"""
 p=subprocess.run(['node','-e',code],cwd=base,capture_output=True,text=True,timeout=90)
 assert p.returncode==0,p.stderr[-1000:]
 subprocess.run(['systemctl','restart','jiayicare-review-api'],check=True)
 healthy=False
 for _ in range(25):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3108/api/health',timeout=2) as r:healthy=r.status==200
   if healthy:break
  except Exception:pass
  time.sleep(1)
 assert healthy,'Review API health failed'
 print(json.dumps({'files':files,'validation':json.loads(p.stdout),'health':healthy}))
except Exception:
 for p in added:p.unlink()
 subprocess.run(['systemctl','restart','jiayicare-review-api'],check=True)
 raise
'''
with connect() as c:
 i,o,e=c.exec_command('python3 -',timeout=180);i.write(REMOTE);i.channel.shutdown_write()
 output=o.read().decode();error=e.read().decode()
 if o.channel.recv_exit_status():raise RuntimeError(error[-1200:])
 print(output)
 pathlib.Path('release/apple-deletion-enable-20261029/review-models.json').write_text(output,encoding='utf-8')
