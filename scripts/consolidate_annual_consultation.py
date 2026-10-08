#!/usr/bin/env python3
"""Safely consolidate one unpushed annual plan's duplicate same-day consultations."""

import argparse
import json
import shlex

from ssh_config import connect


def remote_script(plan_id, expected_updated_at, issue_ids, apply):
    args = json.dumps({'planId': plan_id, 'updatedAt': expected_updated_at, 'issueIds': issue_ids, 'apply': apply})
    return r'''
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient,ObjectId}=require('mongoose').mongo;
const {consolidateSameDayConsultations}=require('./backend/src/utils/annualClinicalRules');
const input=__INPUT__;
(async()=>{
 const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
 try {
  await client.connect(); const db=client.db(); const plans=db.collection('annualplans');
  const plan=await plans.findOne({_id:new ObjectId(input.planId)});
  if(!plan) throw new Error('年度方案不存在');
  if(plan.pushedAt||plan.confirmedAt||plan.frozenAt) throw new Error('方案已经推送、确认或冻结，不能直接修正');
  if(new Date(plan.updatedAt).toISOString()!==input.updatedAt) throw new Error('方案已变化，请重新核对');
  const before=plan.moduleData?.medical_treatment?.records||[];
  const next=consolidateSameDayConsultations({medical_treatment:before}).medical_treatment;
  if(next.length!==before.length-1) throw new Error('预期只合并一组同日就诊，实际不符');
  const merged=next.find(row=>Array.isArray(row.issueIds)&&row.issueIds.length===2);
  if(!merged||merged.hospital!=='浙江大学医学院附属第二医院'||merged.visit_time!=='2026-11-10'||merged.department!=='消化内科'
    ||merged.issueIds.slice().sort().join(',')!==input.issueIds.slice().sort().join(',')) throw new Error('合并结果与已核对事项不符');
  const targets=plan.moduleData?.management_targets?.records||[];
  if(!merged.issueIds.every(id=>targets.some(row=>String(row.issueId)===id))) throw new Error('原始研判目标不完整');
  const summary={planId:input.planId,oldCount:before.length,newCount:next.length,issueIds:merged.issueIds,hospital:merged.hospital,visitTime:merged.visit_time,sourceCount:merged.additionalTimingSources?.length||0,applied:false};
  if(input.apply){
   const backupKey=`consultation-merge:${input.planId}:${input.updatedAt}`;
   await db.collection('annual_plan_correction_backups').updateOne({_id:backupKey},{$setOnInsert:{planId:plan._id,updatedAt:plan.updatedAt,createdAt:new Date(),reason:'合并同日同院同科室重复就诊，保留两项研判和原始方案',original:plan}}, {upsert:true});
   const result=await plans.updateOne({_id:plan._id,updatedAt:plan.updatedAt,pushedAt:null,confirmedAt:null,frozenAt:null},{$set:{'moduleData.medical_treatment.records':next},$currentDate:{updatedAt:true}});
   if(result.modifiedCount!==1) throw new Error('并发更新阻止了修正；备份已留存');
   summary.applied=true;summary.backupKey=backupKey;
  }
  console.log(Buffer.from(JSON.stringify(summary),'utf8').toString('base64'));
 }finally{await client.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1});
'''.replace('__INPUT__', args)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan-id', required=True)
    parser.add_argument('--expected-updated-at', required=True)
    parser.add_argument('--issue-ids', nargs=2, required=True)
    parser.add_argument('--apply', action='store_true')
    options = parser.parse_args()
    command = 'cd /var/www/jiayicare && node -e ' + shlex.quote(remote_script(options.plan_id, options.expected_updated_at, options.issue_ids, options.apply))
    with connect() as ssh:
        _, output, errors = ssh.exec_command(command, timeout=60)
        stdout = output.read().decode('ascii', 'replace').strip()
        if stdout:
            import base64
            print(json.dumps(json.loads(base64.b64decode(stdout)), ensure_ascii=True))
        error = errors.read().decode('utf-8', 'replace').strip()
        if error:
            print(error)
        raise SystemExit(output.channel.recv_exit_status())
