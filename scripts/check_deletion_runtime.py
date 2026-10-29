"""Read-only checks of deployed deletion modules and queue metadata."""
import json,pathlib
from ssh_config import connect
REMOTE=r'''
import subprocess,json,os,datetime,urllib.request
results=[]
for name,base,envfile in [('production','/var/www/jiayicare/backend','/var/www/jiayicare/backend/.env'),('review','/var/www/jiayicare-review/backend','/var/www/jiayicare-secrets/review-backend.env')]:
 code=r"""+require('dotenv').config({path:process.argv[1]});
const fs=require('fs'),path=require('path'),m=require('mongoose');
(async()=>{
for(const f of fs.readdirSync('src/models').filter(f=>f.endsWith('.js')))require(path.resolve('src/models',f));
let modelCheck;try{modelCheck={ok:true,operations:require('./src/utils/accountDeletionPersonalData').buildOperations(m.models,{userId:new m.Types.ObjectId(),tenantId:new m.Types.ObjectId()}).length}}catch(e){modelCheck={ok:false,error:e.message}}
modelCheck.mismatches=require('./src/utils/accountDeletionPersonalData').RULES.filter(r=>!m.models[r.name]?.schema.path(r.path)).map(r=>({...r,exists:!!m.models[r.name]}));
await m.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false});const db=m.connection.db;
const collections=await db.listCollections({}, {nameOnly:true}).toArray();const names=new Set(collections.map(c=>c.name));
const queues={};for(const name of ['accountdeletionrequests','accountdeletionjobs','accountdeletionfinancialarchives','accountdeletionfollowups'])queues[name]=names.has(name)?{count:await db.collection(name).countDocuments({}),indexes:(await db.collection(name).indexes()).map(i=>({key:i.key,unique:!!i.unique}))}:{count:0,indexes:[]};
console.log(JSON.stringify({modelCheck,queues,enabled:process.env.ACCOUNT_DELETION_ENABLED==='true',guard:process.env.ACCOUNT_DELETION_GUARD_ENABLED==='true',policyConfigured:!!require('./src/utils/accountDeletionRequest').readPolicy()}));await m.disconnect();
})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name}));process.exitCode=1});
"""
 p=subprocess.run(['node','-e',code,envfile],cwd=base,capture_output=True,text=True,timeout=90)
 with urllib.request.urlopen('http://127.0.0.1:'+('3000' if name=='production' else '3108')+'/api/health',timeout=5) as r:health=r.status
 results.append({'environment':name,'exit':p.returncode,'result':json.loads(p.stdout) if p.returncode==0 else None,'error':p.stderr[-600:],'health':health})
revision=subprocess.check_output(['git','-C','/var/www/jiayicare','rev-parse','HEAD'],text=True).strip()
print(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'productionRevision':revision,'environments':results}))
'''
with connect() as c:
 i,o,e=c.exec_command('python3 -',timeout=210);i.write(REMOTE);i.channel.shutdown_write()
 output=o.read().decode();error=e.read().decode()
 if o.channel.recv_exit_status():raise RuntimeError(error[-1000:])
 print(output)
 pathlib.Path('release/apple-deletion-enable-20261029/runtime-check.json').write_text(output,encoding='utf-8')
