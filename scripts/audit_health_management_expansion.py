#!/usr/bin/env python3
"""Read-only production audit for expanding the annual health-management rollout."""

import shlex

from ssh_config import connect


REMOTE = r'''
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient,ObjectId}=require('mongoose').mongo;
const crypto=require('crypto');
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const id=x=>String(x||'');
(async()=>{
 const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
 try{
  await client.connect();const db=client.db();
  const plans=await db.collection('annualplans').find({confirmedAt:{$type:'date'}},{projection:{patientId:1,year:1,confirmedAt:1}}).toArray();
  const byPatient=new Map();for(const p of plans){const key=id(p.patientId);if(!byPatient.has(key))byPatient.set(key,[]);byPatient.get(key).push(p);}
  const users=await db.collection('users').find({_id:{$in:[...byPatient.keys()].map(x=>new ObjectId(x))}},{projection:{name:1,isDeleted:1,serviceStartDate:1,serviceExpiry:1,assignedHealthPlanner:1,assignedHealthManager:1,assignedFamilyDoctor:1,clientBrand:1}}).toArray();
  const periods=await db.collection('annualserviceperiods').find({patientId:{$in:users.map(x=>x._id)},confirmedAt:{$type:'date'}},{projection:{patientId:1,startDate:1,endDate:1,sourceType:1}}).toArray();
  const periodsByPatient=new Map();for(const p of periods){const key=id(p.patientId);if(!periodsByPatient.has(key))periodsByPatient.set(key,[]);periodsByPatient.get(key).push(p);}
  const rows=users.map(u=>{
   const patientPlans=byPatient.get(id(u._id))||[];
   const activePeriod=(periodsByPatient.get(id(u._id))||[]).some(p=>p.startDate<=today&&p.endDate>=today);
   const legacyWindow=(!u.serviceStartDate||u.serviceStartDate<=today)&&(!u.serviceExpiry||u.serviceExpiry>=today);
   const roles=!!(u.assignedHealthPlanner&&u.assignedHealthManager&&u.assignedFamilyDoctor);
   return {id:id(u._id),name:u.name||'',brand:u.clientBrand||'',years:[...new Set(patientPlans.map(p=>p.year))],planCount:patientPlans.length,deleted:u.isDeleted===true,roles,start:u.serviceStartDate||'',expiry:u.serviceExpiry||'',activePeriod,legacyWindow};
  });
  const eligible=rows.filter(r=>!r.deleted&&r.roles&&(r.activePeriod||r.legacyWindow));
  const ids=eligible.map(r=>r.id).sort();
  const current=String(process.env.HEALTH_MANAGEMENT_PATIENT_IDS||'').split(',').map(x=>x.trim()).filter(Boolean).sort();
  const activeUsers=await db.collection('users').find({isDeleted:{$ne:true},assignedHealthPlanner:{$ne:null},assignedHealthManager:{$ne:null},assignedFamilyDoctor:{$ne:null},serviceExpiry:{$gte:today}},{projection:{_id:1,name:1,clientBrand:1,servicePackage:1,serviceStartDate:1,serviceExpiry:1,assignedHealthPlanner:1,assignedHealthManager:1,assignedFamilyDoctor:1}}).toArray();
  const broader=activeUsers.filter(u=>!u.serviceStartDate||u.serviceStartDate<=today).map(u=>({id:id(u._id),name:u.name||'',brand:u.clientBrand||'',package:u.servicePackage||'',expiry:u.serviceExpiry||'',confirmedAnnualPlan:byPatient.has(id(u._id)),current:current.includes(id(u._id))}));
  const monthly=String(process.env.MONTHLY_REVIEW_PATIENT_IDS||'').split(',').map(x=>x.trim()).filter(Boolean).sort();
  const allAssigned=await db.collection('users').find({isDeleted:{$ne:true},assignedHealthPlanner:{$ne:null},assignedHealthManager:{$ne:null},assignedFamilyDoctor:{$ne:null}},{projection:{serviceStartDate:1,serviceExpiry:1}}).toArray();
  const broaderIds=broader.map(r=>r.id).sort();
  const roleIds=[...new Set(activeUsers.flatMap(u=>[u.assignedHealthPlanner,u.assignedHealthManager,u.assignedFamilyDoctor]).map(id))].map(x=>new ObjectId(x));
  const admins=await db.collection('admins').find({_id:{$in:roleIds}},{projection:{staffStatus:1}}).toArray();
  const activeRoleIds=new Set(admins.filter(a=>a.staffStatus!=='inactive').map(a=>id(a._id)));
  const missingOrInactiveRoles=activeUsers.filter(u=>!u.serviceStartDate||u.serviceStartDate<=today).filter(u=>[u.assignedHealthPlanner,u.assignedHealthManager,u.assignedFamilyDoctor].some(role=>!activeRoleIds.has(id(role)))).length;
  const ready=activeUsers.filter(u=>(!u.serviceStartDate||u.serviceStartDate<=today)&&u.clientBrand&&u.servicePackage&&[u.assignedHealthPlanner,u.assignedHealthManager,u.assignedFamilyDoctor].every(role=>activeRoleIds.has(id(role))));
  const readyIds=ready.map(u=>id(u._id)).sort();
  console.log(JSON.stringify({today,productionRevision:require('child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),healthMode:process.env.HEALTH_MANAGEMENT_ROLLOUT_MODE||'unset',monthlyMode:process.env.MONTHLY_REVIEW_ROLLOUT_MODE||'unset',monthlyCount:monthly.length,currentCount:current.length,confirmedPlanCount:plans.length,patientCount:rows.length,eligibleCount:eligible.length,eligibleHash:crypto.createHash('sha256').update(ids.join(',')).digest('hex'),activeAssignedClientCount:broader.length,activeAssignedHash:crypto.createHash('sha256').update(broaderIds.join(',')).digest('hex'),readyCount:ready.length,readyHash:crypto.createHash('sha256').update(readyIds.join(',')).digest('hex'),readyIncludesCurrent:current.every(id=>readyIds.includes(id)),activeByBrand:broader.reduce((result,row)=>(result[row.brand||'unset']=(result[row.brand||'unset']||0)+1,result),{}),activeWithoutServicePackage:broader.filter(r=>!r.package).length,missingOrInactiveRoles,assignedNoExpiry:allAssigned.filter(u=>!u.serviceExpiry).length,assignedExpired:allAssigned.filter(u=>u.serviceExpiry&&u.serviceExpiry<today).length,assignedFutureStart:allAssigned.filter(u=>u.serviceStartDate&&u.serviceStartDate>today).length}));
 }finally{await client.close();}
})().catch(e=>{console.error('Audit failed: '+e.message);process.exitCode=1});
'''


if __name__ == "__main__":
    with connect() as ssh:
        _, out, err = ssh.exec_command("cd /var/www/jiayicare && node -e " + shlex.quote(REMOTE), timeout=60)
        print(out.read().decode("utf-8", "replace"))
        error = err.read().decode("utf-8", "replace")
        if error:
            print(error)
        raise SystemExit(out.channel.recv_exit_status())
