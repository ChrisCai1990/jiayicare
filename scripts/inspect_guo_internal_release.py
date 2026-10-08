#!/usr/bin/env python3
"""Inspect the one-plan internal release; --retry syncs its staff tasks."""
import argparse
import base64
import json
import shlex
from ssh_config import connect

parser = argparse.ArgumentParser()
parser.add_argument('--retry', action='store_true')
args = parser.parse_args()
script = r'''
require('dotenv').config({path:'backend/.env',quiet:true});
const mongoose=require('mongoose');
const AnnualPlan=require('./backend/src/models/AnnualPlan');
const FollowUp=require('./backend/src/models/FollowUp');
const Task=require('./backend/src/models/Task');
(async()=>{
 await mongoose.connect(process.env.MONGODB_URI);
 try{
  const plan=await AnnualPlan.findById('6ac6169e07e2feec6321fb77');
  if(!plan||String(plan.patientId)!=='6a4f3531962a3b13144af513')throw Error('方案身份不符');
  const summary=async()=>({updatedAt:plan.updatedAt,pushedAt:plan.pushedAt,confirmedAt:plan.confirmedAt,followUpReleasedAt:plan.followUpReleasedAt,serviceTaskReleasedAt:plan.serviceTaskReleasedAt,
   followups:await FollowUp.aggregate([{$match:{sourceAnnualPlanId:plan._id}},{$group:{_id:{sourceType:'$sourceType',status:'$status',aiStatus:'$aiStatus'},count:{$sum:1}}}]),
   clientTasks:await Task.countDocuments({sourceAnnualPlanId:plan._id})});
  console.log('PREFLIGHT '+Buffer.from(JSON.stringify(await summary())).toString('base64'));
  if(__RETRY__){
   if(!require('./backend/src/utils/annualInternalTaskException').serviceReleased(plan))throw Error('内部任务未获授权');
   try{console.log('FOLLOWUPS '+JSON.stringify(await require('./backend/src/utils/annualPlanFollowUps').syncAnnualPlanFollowUps(plan)));}
   catch(error){console.error('FOLLOWUP_ERROR '+(error.stack||error.message));}
   try{console.log('SERVICES '+JSON.stringify(await require('./backend/src/utils/annualPlanServiceTasks').syncAnnualPlanServiceTasks(plan)));}
   catch(error){console.error('SERVICE_ERROR '+(error.stack||error.message));}
   console.log('AFTER '+Buffer.from(JSON.stringify(await summary())).toString('base64'));
  }
 }finally{await mongoose.disconnect();}
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1});
'''.replace('__RETRY__', 'true' if args.retry else 'false')
command = 'cd /var/www/jiayicare && node -e ' + shlex.quote(script)
with connect() as ssh:
    _, stdout, stderr = ssh.exec_command(command, timeout=120)
    output = stdout.read().decode('utf-8', 'replace')
    for line in output.splitlines():
        if line.startswith(('PREFLIGHT ', 'AFTER ')):
            label, payload = line.split(' ', 1)
            print(label, json.dumps(json.loads(base64.b64decode(payload)), ensure_ascii=True, default=str))
        else:
            print(line)
    error = stderr.read().decode('utf-8', 'replace').strip()
    if error:
        print(error)
    raise SystemExit(stdout.channel.recv_exit_status())
