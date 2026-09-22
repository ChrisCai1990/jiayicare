"""Read-only index/duplicate audit. Never imports production models or prints records."""
import json
import os
from pathlib import Path
import shlex
import subprocess
from ssh_config import connect

ROOT = Path(__file__).resolve().parents[1]
MODELS = ['AnnualPlan', 'AnnualPlanPreparation', 'AnnualServicePeriod',
          'CheckupPreparationHandoff', 'CheckupPreparationSuggestion', 'FollowUp',
          'FollowUpServiceLink', 'MedicalReport', 'Medication', 'PhaseAssessment',
          'ProfessionalHealthAssessment', 'RecurringSupplyPlan', 'ReportFollowUpDraft',
          'Supplement', 'Task']
LOCAL = """
const names = JSON.parse(process.argv[1]);
console.log(JSON.stringify(names.flatMap(n => {
 const m=require('./backend/src/models/'+n);
 return m.schema.indexes().filter(([,o])=>o.unique).map(([key,o])=>({
  collection:m.collection.name,key,options:{unique:true,...(o.sparse?{sparse:true}:{}),
   ...(o.partialFilterExpression?{partialFilterExpression:o.partialFilterExpression}:{})}
 }));
})));
"""
REMOTE = r"""
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient}=require('mongoose').mongo;
const specs=__SPECS__;
(async()=>{
 const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
 try {
  await client.connect(); const db=client.db(); const results=[];
  for(const spec of specs){
   const c=db.collection(spec.collection); let indexes=[];
   try { indexes=await c.listIndexes().toArray(); } catch(e){if(e.code!==26)throw e;}
   const fields=Object.keys(spec.key);
   const match=spec.options.partialFilterExpression || (spec.options.sparse ? {$or:fields.map(f=>({[f]:{$exists:true}}))}:{});
   // Deduplicate array values within each document before checking cross-document collisions.
   const project={}; fields.forEach((f,i)=>project['k'+i]={$cond:[{$isArray:'$'+f},{$setUnion:['$'+f,[]]},[{$ifNull:['$'+f,null]}]]});
   const pipeline=[{$match:match},{$project:project}];
   fields.forEach((f,i)=>pipeline.push({$unwind:'$k'+i}));
   const key={}; fields.forEach((f,i)=>key['k'+i]='$k'+i);
   pipeline.push({$group:{_id:{doc:'$_id',key}}},{$group:{_id:'$_id.key',n:{$sum:1}}},{$match:{n:{$gt:1}}},{$count:'groups'});
   const duplicates=await c.aggregate(pipeline,{maxTimeMS:15000}).toArray();
   const exact=indexes.some(i=>JSON.stringify(i.key)===JSON.stringify(spec.key)&&i.unique===true&&!!i.sparse===!!spec.options.sparse&&JSON.stringify(i.partialFilterExpression||{})===JSON.stringify(spec.options.partialFilterExpression||{}));
   results.push({...spec,exists:exact,duplicateGroups:duplicates[0]?.groups||0,
    eligibleDocuments:await c.countDocuments(match,{maxTimeMS:15000})});
  }
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),readOnly:true,indexes:results}));
 }finally{await client.close();}
})().catch(e=>{console.error(JSON.stringify({auditFailed:true,code:e.code||e.name}));process.exitCode=1;});
"""

if __name__ == '__main__':
    specs = subprocess.check_output(['node', '-e', LOCAL, json.dumps(MODELS)], cwd=ROOT, env=os.environ, text=True)
    specs = json.dumps(json.loads(specs))
    with connect() as ssh:
        _, out, err = ssh.exec_command('cd /var/www/jiayicare && git rev-parse HEAD && node -e ' + shlex.quote(REMOTE.replace('__SPECS__', specs)), timeout=120)
        print(out.read().decode())
        if err.read():
            print('Remote stderr present; no environment details printed.')
        raise SystemExit(out.channel.recv_exit_status())
