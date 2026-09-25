#!/usr/bin/env python3
"""Guarded production switch for global health-management workflows.

Monthly service reviews remain on their independent single-patient allowlist.
The prior environment is retained on the production host for rollback.
"""

import argparse
import shlex

from ssh_config import connect


PILOT_ID = "6a4ef1980f2291549b4ffd8d"
REMOTE = r'''
const fs=require('fs'),cp=require('child_process');
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient}=require('mongoose').mongo;
const expected='__REVISION__',apply=__APPLY__,pilot='__PILOT__';
function check(ok,message){if(!ok)throw new Error(message)}
function command(program,args,timeout=30000,env={}){return cp.spawnSync(program,args,{encoding:'utf8',timeout,env:{...process.env,...env}});}
function backendMode(){const rows=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:15000}));return rows.find(row=>row.name==='jiayicare-backend')?.pm2_env?.HEALTH_MANAGEMENT_ROLLOUT_MODE||'unset';}
(async()=>{
 check(cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()===expected,'Production revision changed');
 check(!cp.execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'Tracked production edits');
 check(process.env.HEALTH_MANAGEMENT_ROLLOUT_MODE==='allowlist'&&process.env.HEALTH_MANAGEMENT_PATIENT_IDS===pilot,'Health rollout is no longer the audited single-patient pilot');
 check(process.env.MONTHLY_REVIEW_ROLLOUT_MODE==='allowlist'&&process.env.MONTHLY_REVIEW_PATIENT_IDS===pilot,'Monthly review allowlist changed');
 check(process.env.HEALTH_MANAGEMENT_RECOVERY_ENABLED==='false'&&process.env.CHECKUP_PREPARATION_AUTO_ENABLED==='false'&&process.env.ENABLE_PHASE_ASSESSMENT_SCHEDULER==='false','Automatic recovery or assessment switches changed');
 const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
 try{
  await client.connect();const db=client.db();
  const existingPilot=await db.collection('users').countDocuments({_id:new (require('mongoose').Types.ObjectId)(pilot),isDeleted:{$ne:true}});
  check(existingPilot===1,'Pilot customer missing');
  const queuedReports=await db.collection('medicalreports').countDocuments({'followUpSourceEvent.status':'queued'});
  if(!apply){console.log(JSON.stringify({ready:true,healthMode:'allowlist',runtimeHealthMode:backendMode(),monthlyMode:'allowlist',monthlyPatientCount:1,automaticRecovery:false,queuedReports}));return;}
  const backup='/var/backups/jiayicare/health-global-20260925-'+expected.slice(0,12);
  check(!fs.existsSync(backup),'Backup target already exists; inspect before retry');
  fs.mkdirSync(backup,{recursive:true,mode:0o700});fs.chmodSync(backup,0o700);
  fs.copyFileSync('backend/.env',backup+'/backend.env');fs.chmodSync(backup+'/backend.env',0o600);
  let content=fs.readFileSync('backend/.env','utf8');
  content=content.replace(/^\s*(?:export\s+)?HEALTH_MANAGEMENT_ROLLOUT_MODE\s*=.*$/gm,'');
  content+='\nHEALTH_MANAGEMENT_ROLLOUT_MODE=all\n';
  const temp='backend/.env.health-global-'+expected.slice(0,12)+'.tmp';
  fs.writeFileSync(temp,content,{flag:'wx',mode:0o600});
  try{
   fs.renameSync(temp,'backend/.env');
   check(command('pm2',['restart','jiayicare-backend','--update-env'],30000,{HEALTH_MANAGEMENT_ROLLOUT_MODE:'all'}).status===0,'Backend restart failed');
   check(backendMode()==='all','Backend runtime did not receive global rollout mode');
   let healthy=false;
   for(let attempt=0;attempt<5&&!healthy;attempt++){
    const health=command('curl',['-fsS','--max-time','10','http://127.0.0.1:3000/api/health'],15000);
    healthy=health.status===0&&health.stdout.includes('"success":true');
    if(!healthy)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1000);
   }
   check(healthy,'Backend health check failed');
   const verify=command('node',['-e',"require('dotenv').config({path:'backend/.env',quiet:true});const h=require('./backend/src/utils/healthManagementRollout'),m=require('./backend/src/utils/monthlyReviewRollout');if(!h.enabledForPatient('000000000000000000000002')||m.enabledForPatient('000000000000000000000002')||!m.enabledForPatient('"+pilot+"'))process.exit(1)"],15000);
   check(verify.status===0,'Rollout boundary verification failed');
  }catch(error){
   const restore='backend/.env.health-global-rollback-'+expected.slice(0,12)+'.tmp';
   fs.copyFileSync(backup+'/backend.env',restore);fs.chmodSync(restore,0o600);fs.renameSync(restore,'backend/.env');
   const restart=command('pm2',['restart','jiayicare-backend','--update-env'],30000,{HEALTH_MANAGEMENT_ROLLOUT_MODE:'allowlist'});
   throw new Error(error.message+'; previous environment restored'+(restart.status===0?' and backend restarted':' but backend restart failed'));
  }
  console.log(JSON.stringify({applied:true,healthMode:'all',monthlyMode:'allowlist',monthlyPatientCount:1,automaticRecovery:false,queuedReports,revision:expected,backupReady:true,backendHealthy:true}));
 }finally{await client.close();}
})().catch(e=>{console.error('Global rollout failed: '+e.message);process.exitCode=1});
'''


def run(phase: str, revision: str) -> None:
    script = (REMOTE.replace("__REVISION__", revision)
                    .replace("__APPLY__", "true" if phase == "apply" else "false")
                    .replace("__PILOT__", PILOT_ID))
    with connect() as ssh:
        _, out, err = ssh.exec_command("cd /var/www/jiayicare && node -e " + shlex.quote(script), timeout=90)
        output = out.read().decode("utf-8", "replace").strip()
        error = err.read().decode("utf-8", "replace").strip()
        if output:
            print(output)
        if error:
            print(error)
        raise SystemExit(out.channel.recv_exit_status())


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=["check", "apply"])
    parser.add_argument("--expected-revision", required=True)
    args = parser.parse_args()
    if len(args.expected_revision) != 40 or any(c not in "0123456789abcdef" for c in args.expected_revision):
        parser.error("--expected-revision must be a full lowercase commit SHA")
    run(args.phase, args.expected_revision)
