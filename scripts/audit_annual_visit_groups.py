#!/usr/bin/env python3
"""Read-only service grouping audit of a single annual plan."""
import argparse
import base64
import json
import shlex

from ssh_config import connect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('plan_id')
plan_id = parser.parse_args().plan_id
script = r'''
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient,ObjectId}=require('mongoose').mongo;
(async()=>{
 const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
 try{
  await client.connect();
  const plan=await client.db().collection('annualplans').findOne({_id:new ObjectId(__ID__)},
   {projection:{updatedAt:1,pushedAt:1,confirmedAt:1,moduleData:1}});
  if(!plan)throw Error('方案不存在');
  const dates={medical_treatment:'visit_time',checkup_completion:'time',abnormal_followup:'time'};
  const rows=Object.entries(dates).flatMap(([module,dateKey])=>(plan.moduleData?.[module]?.records||[]).map((row,index)=>({
   module,index,date:row[dateKey]||'',hospital:row.hospital||'',department:row.department||'',expert:row.expert||'',
   title:row.items||row.name||row.reason||'',mode:row.serviceMode||'reminder',managedServiceType:row.managedServiceType||'',visitGroupId:row.visitGroupId||''})));
  console.log(Buffer.from(JSON.stringify({updatedAt:plan.updatedAt,pushedAt:plan.pushedAt,confirmedAt:plan.confirmedAt,rows})).toString('base64'));
 }finally{await client.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1});
'''.replace('__ID__', json.dumps(plan_id))
command = 'cd /var/www/jiayicare && node -e ' + shlex.quote(script)
with connect() as ssh:
    _, stdout, stderr = ssh.exec_command(command, timeout=60)
    output = stdout.read().decode('utf-8', 'replace').strip()
    if output:
        print(json.dumps(json.loads(base64.b64decode(output)), ensure_ascii=True, indent=2, default=str))
    error = stderr.read().decode('utf-8', 'replace').strip()
    if error:
        print(error)
    raise SystemExit(stdout.channel.recv_exit_status())
