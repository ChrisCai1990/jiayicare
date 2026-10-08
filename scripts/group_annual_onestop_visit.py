#!/usr/bin/env python3
"""Version-checked correction of the verified two-date outpatient one-stop draft."""
import argparse
import base64
import json
import shlex

from ssh_config import connect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--plan-id', required=True)
parser.add_argument('--expected-updated-at', required=True)
parser.add_argument('--apply', action='store_true')
options = parser.parse_args()
payload = json.dumps({'planId': options.plan_id, 'updatedAt': options.expected_updated_at, 'apply': options.apply})
script = r'''
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient,ObjectId}=require('mongoose').mongo;
const {validateVisitGroups}=require('./backend/src/utils/annualVisitGroups');
const {buildAnnualPlanServiceTasks}=require('./backend/src/utils/annualPlanServiceTasks');
const input=__INPUT__;
const hospital=value=>/^(?:浙二医院|浙大二院|浙江大学医学院附属二院|浙江大学医学院附属第二医院)$/.test(String(value||'').replace(/[\s（）()·・]/g,''));
(async()=>{
 const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
 try{
  await client.connect(); const db=client.db(); const plans=db.collection('annualplans');
  const plan=await plans.findOne({_id:new ObjectId(input.planId)});
  if(!plan)throw Error('年度方案不存在');
  if(plan.pushedAt||plan.confirmedAt||plan.frozenAt)throw Error('已发布或确认，不能直接修改');
  if(new Date(plan.updatedAt).toISOString()!==input.updatedAt)throw Error('方案已变化，请重新核对');
  const rows=plan.moduleData?.medical_treatment?.records||[];
  if(rows.length!==5||rows.some((row,index)=>row.visitGroupId||!hospital(row.hospital)||row.visit_time!==(index<4?'2026-12-04':'2026-11-10'))
   ||rows[0].serviceMode!=='managed'||rows[0].managedServiceType!=='outpatient'
   ||rows.slice(1).some(row=>row.serviceMode!=='reminder'))throw Error('当前草稿与已核对的五项就医安排不一致');
  const next=structuredClone(plan.moduleData);
  next.medical_treatment.records.forEach((row,index)=>{
   if(index<4)row.visitGroupId='2026-12-04 浙二一站式就医';
   if(index>0&&index<4){row.serviceMode='shared';row.serviceType='';row.managedServiceType='';}
   if(index===4){row.serviceMode='managed';row.managedServiceType='outpatient';row.serviceType='';}
  });
  const issue=validateVisitGroups(next);if(issue)throw Error(issue);
  const before=buildAnnualPlanServiceTasks({moduleData:plan.moduleData,confirmedAt:new Date()}).filter(row=>row.stage==='service_request'&&row.formData.serviceRequest.moduleKey==='medical_treatment');
  const after=buildAnnualPlanServiceTasks({moduleData:next,confirmedAt:new Date()}).filter(row=>row.stage==='service_request'&&row.formData.serviceRequest.moduleKey==='medical_treatment');
  if(before.length!==1||after.length!==2||after[0].formData.serviceRequest.itemSnapshot.visitItems?.length!==4||after[1].formData.serviceRequest.mode!=='managed')throw Error('EXPECTED_SERVICE_REQUESTS_MISMATCH '+JSON.stringify({before:before.length,after:after.length,items:after[0]?.formData.serviceRequest.itemSnapshot.visitItems?.length,modes:after.map(row=>row.formData.serviceRequest.mode)}));
  const summary={planId:input.planId,beforeRequests:before.length,afterRequests:after.length,groupedItems:4,dates:['2026-11-10','2026-12-04'],applied:false};
  if(input.apply){
   const backupKey=`annual-onestop-group:${input.planId}:${input.updatedAt}`;
   await db.collection('annual_plan_correction_backups').updateOne({_id:backupKey},{$setOnInsert:{planId:plan._id,updatedAt:plan.updatedAt,createdAt:new Date(),reason:'同院同日就医事项合并到一站式行程，保留两次就医日期及原始管理事项',original:plan}},{upsert:true});
   const saved=await plans.updateOne({_id:plan._id,updatedAt:plan.updatedAt,pushedAt:null,confirmedAt:null,frozenAt:null},{$set:{moduleData:next},$currentDate:{updatedAt:true}});
   if(saved.modifiedCount!==1)throw Error('并发修改阻止了更新；备份已保留');
   summary.applied=true;summary.backupKey=backupKey;
  }
  console.log(Buffer.from(JSON.stringify(summary)).toString('base64'));
 }finally{await client.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1});
'''.replace('__INPUT__', payload)
command = 'cd /var/www/jiayicare && node -e ' + shlex.quote(script)
with connect() as ssh:
    _, stdout, stderr = ssh.exec_command(command, timeout=60)
    output = stdout.read().decode('ascii', 'replace').strip()
    if output:
        print(json.dumps(json.loads(base64.b64decode(output)), ensure_ascii=True))
    error = stderr.read().decode('utf-8', 'replace').strip()
    if error:
        print(error)
    raise SystemExit(stdout.channel.recv_exit_status())
