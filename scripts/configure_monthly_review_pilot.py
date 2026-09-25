#!/usr/bin/env python3
"""Verify and enable the single-patient monthly-review pilot on production.

Run `check` before release and `apply` before deploy.py restarts the backend.
Never prints credentials or patient identifiers. The previous .env is backed up
on the production host before a guarded, atomic replacement.
"""
import argparse
import json
import shlex

from ssh_config import connect

PATIENT_ID = "6a4ef1980f2291549b4ffd8d"
REMOTE_DIR = "/var/www/jiayicare"
BACKUP_DIR = "/var/backups/jiayicare/monthly-review-pilot-20260925"

CHECK = r'''
const fs=require('fs');
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient,ObjectId}=require('mongoose').mongo;
const id='__PATIENT_ID__';
(async()=>{
 const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
 try {await client.connect();const db=client.db();
  const user=await db.collection('users').findOne({_id:new ObjectId(id),isDeleted:{$ne:true}},{projection:{name:1}});
  const planCount=await db.collection('annualplans').countDocuments({patientId:new ObjectId(id),confirmedAt:{$ne:null}});
  const reviewCount=await db.collection('monthlyservicereviews').countDocuments({});
  console.log(JSON.stringify({patientVerified:user?.name==='金娟',healthAllowlistOnlyPatient:process.env.HEALTH_MANAGEMENT_ROLLOUT_MODE==='allowlist'&&process.env.HEALTH_MANAGEMENT_PATIENT_IDS===id,confirmedAnnualPlanExists:planCount>0,existingReviewCount:reviewCount,monthlyMode:process.env.MONTHLY_REVIEW_ROLLOUT_MODE||'unset',monthlyAllowlistMatches:process.env.MONTHLY_REVIEW_PATIENT_IDS===id}));
 }finally{await client.close();}
})().catch(e=>{console.error('Pilot check failed: '+e.message);process.exitCode=1});
'''

APPLY = r'''
const fs=require('fs'),cp=require('child_process');
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient,ObjectId}=require('mongoose').mongo;
const id='__PATIENT_ID__',backup='__BACKUP_DIR__',expected='__EXPECTED__';
function check(value,message){if(!value)throw new Error(message)}
(async()=>{
 check(cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()===expected,'Production revision changed');
 check(!cp.execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'Production has tracked edits');
 check(process.env.HEALTH_MANAGEMENT_ROLLOUT_MODE==='allowlist'&&process.env.HEALTH_MANAGEMENT_PATIENT_IDS===id,'Existing health-management allowlist is not exactly the approved patient');
 check(!process.env.MONTHLY_REVIEW_ROLLOUT_MODE||['disabled','allowlist'].includes(process.env.MONTHLY_REVIEW_ROLLOUT_MODE),'Unexpected monthly review mode');
 check(!process.env.MONTHLY_REVIEW_PATIENT_IDS||process.env.MONTHLY_REVIEW_PATIENT_IDS===id,'Unexpected monthly review allowlist');
 const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
 try {await client.connect();const db=client.db();
  const user=await db.collection('users').findOne({_id:new ObjectId(id),isDeleted:{$ne:true}},{projection:{name:1}});
  check(user?.name==='金娟','Approved patient identity mismatch');
  check(await db.collection('annualplans').countDocuments({patientId:new ObjectId(id),confirmedAt:{$ne:null}})>0,'No confirmed annual plan');
  const collection=db.collection('monthlyservicereviews');
  check(await collection.countDocuments({})===0,'Monthly review data already exists; inspect before applying');
  await collection.createIndex({patientId:1,month:1},{unique:true,name:'patientId_1_month_1'});
  if(!fs.existsSync(backup))fs.mkdirSync(backup,{recursive:true,mode:0o700});
  check(!fs.existsSync(backup+'/backend.env'),'Pilot environment backup already exists');
  fs.copyFileSync('backend/.env',backup+'/backend.env');fs.chmodSync(backup+'/backend.env',0o600);
  let env=fs.readFileSync('backend/.env','utf8');
  for(const [key,value]of Object.entries({MONTHLY_REVIEW_ROLLOUT_MODE:'allowlist',MONTHLY_REVIEW_PATIENT_IDS:id})){
   env=env.replace(new RegExp('^\\s*(?:export\\s+)?'+key+'\\s*=.*$','gm'),'');env+='\n'+key+'='+value+'\n';
  }
  const temp='backend/.env.monthly-review-pilot.tmp';
  fs.writeFileSync(temp,env,{flag:'wx',mode:0o600});fs.renameSync(temp,'backend/.env');
  console.log(JSON.stringify({indexReady:true,backupReady:true,monthlyMode:'allowlist',patientCount:1}));
 }finally{await client.close();}
})().catch(e=>{console.error('Pilot apply failed: '+e.message);process.exitCode=1});
'''


def run(script: str) -> None:
    command = f"cd {REMOTE_DIR} && node -e {shlex.quote(script)}"
    with connect() as ssh:
        _, stdout, stderr = ssh.exec_command(command, timeout=90)
        out = stdout.read().decode("utf-8", "replace").strip()
        err = stderr.read().decode("utf-8", "replace").strip()
        if out:
            print(out)
        if err:
            print(err)
        if stdout.channel.recv_exit_status():
            raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=["check", "apply"])
    parser.add_argument("--expected-revision", default="")
    args = parser.parse_args()
    if args.phase == "apply" and len(args.expected_revision) != 40:
        parser.error("--expected-revision must be the current production commit SHA")
    source = CHECK if args.phase == "check" else APPLY.replace("__BACKUP_DIR__", BACKUP_DIR).replace("__EXPECTED__", args.expected_revision)
    run(source.replace("__PATIENT_ID__", PATIENT_ID))
