"""Explicit single-patient release prerequisites; no business-document writes.

Backups stay private on the production host. Never drops indexes or restores data.
Run backup first, then apply only under approved production release authority.
"""
import argparse
import json
import os
import shlex
import subprocess
from audit_release_indexes import LOCAL, MODELS, ROOT
from ssh_config import connect

BASE = 'c29e894293aae1aedb76f5e74bdaa93dba2980f8'
BACKUP = '/var/backups/jiayicare/pilot-20260922-29fd9326'
COMMON = r'''
const fs=require('fs'), cp=require('child_process');
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient,ObjectId}=require('mongoose').mongo;
const backup=__BACKUP__, baseline=__BASE__;
function check(ok,message){if(!ok)throw new Error(message);}
function run(command,args,log){
 const fd=fs.openSync(backup+'/'+log,'a',0o600);
 try {const r=cp.spawnSync(command,args,{stdio:['ignore',fd,fd],timeout:240000});check(r.status===0,command+' failed; private log retained');}
 finally{fs.closeSync(fd);}
}
(async()=>{
 check(cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()===baseline,'Production revision changed');
 check(!cp.execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'Tracked production edits');
 const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
 try {await client.connect();const db=client.db();
 const patientId=new ObjectId('6a4ef1980f2291549b4ffd8d');
 const selected=await db.collection('users').findOne({_id:patientId,isDeleted:{$ne:true},archivedAt:null});
 check(selected && selected.name==='金娟','Approved patient identity mismatch');
 check(selected.assignedFamilyDoctor&&selected.assignedHealthManager&&selected.assignedHealthPlanner,'Patient role assignment missing');
 __ACTION__
 }finally{await client.close();}
})().catch(e=>{console.error('Release prerequisite failed: '+e.message);process.exitCode=1;});
'''
BACKUP_ACTION = r'''
 check(!fs.existsSync(backup),'Backup directory already exists; inspect instead of overwriting');
 fs.mkdirSync(backup,{recursive:true,mode:0o700});fs.chmodSync(backup,0o700);
 fs.copyFileSync('backend/.env',backup+'/backend.env');fs.chmodSync(backup+'/backend.env',0o600);
 run('git',['bundle','create',backup+'/baseline.bundle','HEAD'],'code.log');
 run('git',['bundle','verify',backup+'/baseline.bundle'],'code.log');
 const staticPaths=['app/dist','app-jinyisen/dist','admin/dist','staff/dist'].filter(p=>fs.existsSync(p));
 check(staticPaths.length===4,'Expected web assets missing');
 run('tar',['-czf',backup+'/web-assets.tar.gz',...staticPaths],'assets.log');
 run('gzip',['-t',backup+'/web-assets.tar.gz'],'assets.log');
 let locked=false;
 try {
  await db.admin().command({fsync:1,lock:true});locked=true;
  run('mongodump',['--uri',process.env.MONGODB_URI,'--archive='+backup+'/database.archive.gz','--gzip'],'database.log');
 }finally{if(locked)await db.admin().command({fsyncUnlock:1});}
 run('gzip',['-t',backup+'/database.archive.gz'],'database.log');
 run('mongorestore',['--uri',process.env.MONGODB_URI,'--archive='+backup+'/database.archive.gz','--gzip','--dryRun'],'dry-run.log');
 check(fs.statSync(backup+'/database.archive.gz').size>0,'Empty backup');
 fs.writeFileSync(backup+'/ready.json',JSON.stringify({baseline,createdAt:new Date().toISOString(),databaseLockedDuringDump:true,archiveDryRunPassed:true,fullRestoreRehearsed:false,staticPaths}),{mode:0o600});
 console.log(JSON.stringify({backupReady:true,path:backup,archiveDryRunPassed:true,fullRestoreRehearsed:false}));
'''
APPLY_ACTION = r'''
 const ready=JSON.parse(fs.readFileSync(backup+'/ready.json','utf8'));
 check(ready.baseline===baseline&&ready.archiveDryRunPassed,'Verified backup missing');
 const specs=__SPECS__;const missing=[];
 for(const spec of specs){
  const c=db.collection(spec.collection);let indexes=[];
  try{indexes=await c.listIndexes().toArray();}catch(e){if(e.code!==26)throw e;}
  const same=indexes.find(i=>JSON.stringify(i.key)===JSON.stringify(spec.key));
  if(same){check(same.unique===true&&!!same.sparse===!!spec.options.sparse&&JSON.stringify(same.partialFilterExpression||{})===JSON.stringify(spec.options.partialFilterExpression||{}),'Conflicting index options');continue;}
  const match=spec.options.partialFilterExpression||(spec.options.sparse?{$or:Object.keys(spec.key).map(f=>({[f]:{$exists:true}}))}:{});
  check(await c.countDocuments(match)===0,'New index now has eligible data; rerun conflict review');missing.push(spec);
 }
 check(missing.length===16,'Expected exactly reviewed 16 missing indexes');
 for(const spec of missing)await db.collection(spec.collection).createIndex(spec.key,spec.options);
 const switches={STARTUP_SCHEMA_WRITES_ENABLED:'false',HEALTH_MANAGEMENT_ROLLOUT_MODE:'allowlist',HEALTH_MANAGEMENT_PATIENT_IDS:String(patientId),HEALTH_MANAGEMENT_RECOVERY_ENABLED:'false',CHECKUP_PREPARATION_AUTO_ENABLED:'false',ENABLE_PHASE_ASSESSMENT_SCHEDULER:'false'};
 let env=fs.readFileSync('backend/.env','utf8');
 for(const [key,value]of Object.entries(switches)){
  const pattern=new RegExp('^\\s*(?:export\\s+)?'+key+'\\s*=.*$','gm');
  env=env.replace(pattern,'');env+='\n'+key+'='+value+'\n';
 }
 const temporary='backend/.env.pilot-29fd9326.tmp';
 fs.writeFileSync(temporary,env,{flag:'wx',mode:0o600});fs.renameSync(temporary,'backend/.env');
 fs.writeFileSync(backup+'/applied.json',JSON.stringify({createdAt:new Date().toISOString(),indexes:missing,switches}),{mode:0o600});
 console.log(JSON.stringify({indexesAdded:missing.length,rolloutMode:'allowlist',patientCount:1,newRecoveryEnabled:false,configurationReady:true}));
'''

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['backup', 'apply'])
    args = parser.parse_args()
    action = BACKUP_ACTION
    if args.phase == 'apply':
        specs = subprocess.check_output(['node', '-e', LOCAL, json.dumps(MODELS)], cwd=ROOT, env=os.environ, text=True)
        action = APPLY_ACTION.replace('__SPECS__', json.dumps(json.loads(specs)))
    code = COMMON.replace('__BACKUP__', json.dumps(BACKUP)).replace('__BASE__', json.dumps(BASE)).replace('__ACTION__', action)
    with connect() as ssh:
        _, out, err = ssh.exec_command('cd /var/www/jiayicare && node -e ' + shlex.quote(code), timeout=600)
        print(out.read().decode())
        error = err.read().decode()
        if error:
            print(error)
        raise SystemExit(out.channel.recv_exit_status())
