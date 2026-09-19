"""Read-only checkup rollout audit. No application models, migrations or writes."""
import argparse
import json
import shlex
from ssh_config import connect

JS = r"""
require('dotenv').config({path:'backend/.env', quiet:true});
const mongoose=require('mongoose');
const {execFileSync}=require('child_process');
(async()=>{
  const target=JSON.parse(process.argv[1]);
  await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000});
  const db=mongoose.connection.db;
  const build=await db.admin().command({buildInfo:1});
  const hello=await db.admin().command({hello:1});
  const result={database:{version:build.version,replicaSet:!!hello.setName,sharded:hello.msg==='isdbgrid'},indexes:{}};
  result.revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  result.trackedChanges=execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).length;
  try {
    const processes=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'}));
    const app=processes.find(p=>p.name==='jiayicare-backend');
    result.runtime={status:app?.pm2_env?.status||'not_found',checkupAutoEnabled:app?.pm2_env?.CHECKUP_PREPARATION_AUTO_ENABLED==='true',
      fileCheckupAutoEnabled:process.env.CHECKUP_PREPARATION_AUTO_ENABLED==='true'};
  } catch { result.runtime={status:'unavailable'}; }
  for(const name of ['followups','checkuppreparationhandoffs','checkuppreparationsuggestions']){
    const exists=await db.listCollections({name},{nameOnly:true}).hasNext();
    result.indexes[name]=exists ? (await db.collection(name).indexes()).map(x=>({key:x.key,unique:x.name==='_id_'||!!x.unique,sparse:!!x.sparse,partial:!!x.partialFilterExpression})) : null;
  }
  const clients=await db.collection('users').find({name:target,isDeleted:{$ne:true},archivedAt:null},{projection:{_id:1,name:1,assignedFamilyDoctor:1,assignedHealthPlanner:1,assignedHealthManager:1,isDeleted:1,archivedAt:1}}).limit(3).toArray();
  result.activeOnly=true;
  result.matchCount=clients.length;
  if(clients.length!==1){result.matches=clients.map(x=>({id:x._id,name:x.name,archived:!!(x.isDeleted||x.archivedAt)}));console.log(JSON.stringify(result));return;}
  const user=clients[0];
  result.client={id:user._id,name:user.name,archived:!!(user.isDeleted||user.archivedAt),roles:{}};
  for(const field of ['assignedFamilyDoctor','assignedHealthPlanner','assignedHealthManager']){
    const raw=user[field];
    const id=raw&&mongoose.isValidObjectId(raw)?new mongoose.Types.ObjectId(String(raw)):null;
    const staff=id?await db.collection('admins').findOne({_id:id},{projection:{name:1,role:1,status:1,isActive:1}}):null;
    result.client.roles[field]=staff?{name:staff.name,role:staff.role,status:staff.status,isActive:staff.isActive}:{missing:true};
  }
  const pid=user._id;
  result.annualPlans=await db.collection('annualplans').find({patientId:pid},{projection:{year:1,planType:1,reviewStatus:1,pushedAt:1,confirmedAt:1,checkupPreparationAutoConfirmedAt:1,'moduleData.annual_checkup.enabled':1,'moduleData.annual_checkup.date':1}}).sort({year:-1}).limit(10).toArray();
  result.periods=await db.collection('annualserviceperiods').find({patientId:pid},{projection:{annualPlanId:1,sourceType:1,startDate:1,endDate:1,confirmedAt:1,activationStatus:1,syncState:1}}).toArray();
  result.services=await db.collection('healthplans').find({patientId:pid,$or:[{type:'annual_checkup'},{type:'medical_assist','content.serviceDomain':'annual_checkup'}]},
    {projection:{type:1,status:1,sourceOrderId:1,preparationTaskId:1,pushedAt:1,confirmedAt:1,'content.serviceDomain':1,'content.serviceDate':1,'content.aiStatus':1,'content.workflowCompletedAt':1}}).sort({createdAt:-1}).limit(20).toArray();
  result.tasks=await db.collection('followups').aggregate([{$match:{patientId:pid,$or:[{sourceScheduleKey:/annual_checkup/},{workflowKey:/annual_checkup_preparation:/},{sourceHealthPlanId:{$in:result.services.map(x=>x._id)}}]}},
    {$group:{_id:{source:'$sourceType',status:'$status',role:'$taskRole',blocked:'$isBlocked'},count:{$sum:1}}}]).toArray();
  const orderIds=result.services.map(x=>x.sourceOrderId).filter(Boolean);
  result.linkedOrders=await db.collection('orders').find({_id:{$in:orderIds}},{projection:{status:1,paymentStatus:1,refundStatus:1,totalUnits:1,usedUnits:1,'redemptions.servicePlanId':1}}).toArray();
  result.handoffCount=await db.collection('checkuppreparationhandoffs').countDocuments({patientId:pid});
  console.log(JSON.stringify(result));
})().catch(e=>{console.error('Read-only audit failed: '+e.name);process.exitCode=1}).finally(()=>mongoose.disconnect());
"""

if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--patient-name', required=True)
    args = parser.parse_args()
    with connect() as ssh:
        command = 'cd /var/www/jiayicare && node -e ' + shlex.quote(JS) + ' ' + shlex.quote(json.dumps(args.patient_name, ensure_ascii=True))
        _, out, err = ssh.exec_command(command, timeout=45)
        print(out.read().decode('utf-8'))
        error = err.read().decode('utf-8')
        if error:
            print(error)
        raise SystemExit(out.channel.recv_exit_status())
