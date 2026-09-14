const {randomUUID}=require('crypto');
const {same,canAccessGroup,canAccessPatient}=require('./serviceGroupRules');

function slotAt(now=new Date()) {
  const china=new Date(+now+8*3600000),day=china.toISOString().slice(0,10),hour=china.getUTCHours();
  if(hour<12)return null;
  const h=hour>=20?'20':'12';
  return {key:`material-${day}-${h}`,cutoff:new Date(`${day}T${h}:00:00+08:00`)};
}
async function canArchive(g,p,staff) {
  if(!g?.archiveConsent||!staff||!p||!canAccessGroup(staff,g)||!canAccessPatient(staff,p)||!g.members.some(x=>same(x.patientId,p._id)))return false;
  if(!['superadmin','familyDoctor','nutritionist','healthManager','medicalAssistant','psychologist','rehabSpecialist','tcmDoctor','specialist','healthPlanner'].includes(staff.role))return false;
  for(const member of g.members) {
    const patient=await require('../models/User').findById(member.patientId);
    if(!canAccessPatient(staff,patient))return false;
  }
  return true;
}
async function runMaterialSchedule({now=new Date(),Cursor=require('../models/WecomArchiveCursor'),archive=require('./archiveGroupMaterials')}={}) {
  if(process.env.SERVICE_GROUP_MATERIAL_SCHEDULE_ENABLED!=='true')return;
  const slot=slotAt(now);if(!slot)return;
  const owner=randomUUID();
  await Cursor.updateOne({_id:slot.key},{$setOnInsert:{seq:0}},{upsert:true});
  const lock=await Cursor.findOneAndUpdate({_id:slot.key,seq:0,$or:[{leaseUntil:{$exists:false}},{leaseUntil:{$lt:now}}]},{$set:{leaseOwner:owner,leaseUntil:new Date(+now+300000)}},{new:true});
  if(!lock)return;
  const counters={archived:0,duplicate:0,failed:0,blocked:0};
  const heartbeat=setInterval(()=>Cursor.updateOne({_id:slot.key,leaseOwner:owner},{$set:{leaseUntil:new Date(Date.now()+300000)}}).catch(()=>{}),30000);
  try {
    const Receipt=require('../models/ServiceGroupReceipt');
    const rows=await Receipt.find({autoScheduled:true,state:{$in:['queued','failed']},scheduledAt:{$lte:slot.cutoff},lastAutoSlot:{$ne:slot.key}}).sort({scheduledAt:1}).limit(50).lean();
    for(const r of rows) {
      const g=await require('../models/ServiceGroup').findById(r.groupId),p=await require('../models/User').findById(r.patientId),staff=await require('../models/Admin').findById(r.staffId);
      let allowed=await canArchive(g,p,staff);
      if(allowed && staff.role!=='superadmin' && staff.customRoleId) {
        const role=await require('../models/StaffRole').findById(staff.customRoleId).lean();
        allowed=!!(role?.permissions?.patients?.view&&role?.permissions?.service_records?.view&&role?.permissions?.[r.purpose==='report'?'reports':'service_records']?.create);
      }
      await Receipt.updateOne({_id:r._id},{$set:{lastAutoSlot:slot.key}});
      if(!allowed){counters.blocked++;continue;}
      const [result]=await archive({g,p,staff,ids:[r.messageId],purpose:r.purpose,title:r.title,date:r.date,category:r.documentCategory});
      if(result?.success){counters.archived++;if(result.duplicate)counters.duplicate++;}else counters.failed++;
    }
    await Cursor.updateOne({_id:slot.key,leaseOwner:owner},{$set:{seq:rows.length<50?1:0,lastSuccessAt:new Date(),lastError:'',counters}});
    return counters;
  } finally {
    clearInterval(heartbeat);
    await Cursor.updateOne({_id:slot.key,leaseOwner:owner},{$unset:{leaseOwner:1,leaseUntil:1}});
  }
}
function startMaterialSchedule() {
  if(process.env.SERVICE_GROUP_MATERIAL_SCHEDULE_ENABLED!=='true')return;
  let running=false;
  const check=async()=>{if(running)return;running=true;try{await runMaterialSchedule();}catch{console.error('[group-materials] schedule_failed');}finally{running=false;}};
  check();const timer=setInterval(check,60000);timer.unref();
}
module.exports={slotAt,canArchive,runMaterialSchedule,startMaterialSchedule};
