const policy = require('./managementReviewPolicy');
const { fields: draftFields } = require('./managementReviewAI');
function missingDraftRoles(row) {
 if(row.status!=='collecting')return [];
 return row.roles.filter(role=>{
  const value=row.contributions?.[role];
  // Existing drafts, returned revisions and submitted professional opinions are never overwritten by a scan.
  return !value || (value.status!=='submitted'&&value.status!=='returned'&&!draftFields.some(field=>value[field]));
 });
}
function canRetry(row,now=new Date()) {
 if(row.generation?.status==='running')return new Date(row.generation.startedAt).getTime()<now.getTime()-180000;
 if(row.generation?.status==='failed')return new Date(row.generation.at).getTime()<now.getTime()-6*3600000;
 return true;
}
async function generateMissing({user,row,loadSource,readActor,generate,withinActor,now=new Date()}) {
 if(!canRetry(row,now))return row;
 const roles=missingDraftRoles(row);if(!roles.length)return row;
 const source=await loadSource(user,row);
 for(const role of roles){
  const actor=await readActor(user[policy.fields[role]]);
  if(!actor||actor.role!==role||actor.staffStatus==='inactive'||String(actor.tenantId||'')!==String(user.tenantId||''))throw new Error('复盘岗位指派或机构状态待核实');
  row=await withinActor(actor,()=>generate({user,row,staff:actor,roles:[role],source,automatic:true}));
  row=row.toObject?row.toObject():row;
 }return row;
}
let scanning=false;
async function scan(now=new Date()) {
 if(scanning||process.env.MANAGEMENT_REVIEW_MODE!=='allowlist')return 0;
 scanning=true;let count=0;
 try {
 const User=require('../models/User'),Review=require('../models/ManagementReview'),Admin=require('../models/Admin'),Tenant=require('../models/Tenant');
 const ids=String(process.env.MANAGEMENT_REVIEW_PATIENT_IDS||'').split(',').map(x=>x.trim()).filter(x=>/^[a-f\d]{24}$/i.test(x)&&policy.enabled(x));
 if(!ids.length)return 0;
 const users=await User.find({_id:{$in:ids},isDeleted:{$ne:true}}).lean();
 for(const user of users){
  if(!user.assignedFamilyDoctor||!user.assignedNutritionist||!user.assignedHealthManager)continue;
  const tenant=await Tenant.findById(user.tenantId).select('status code serviceScope').lean();
  if(tenant?.status!=='active'||!require('./tenantChannel').hasTenantChannel(tenant,'staff'))continue;
  const access=await require('./serviceAccess').resolveServiceAccess(user,now);if(!access.active)continue;
  for(const period of policy.periods(user,now).filter(p=>p.due)){
   try {
    let row=await Review.findOne({patientId:user._id,periodKey:period.key}).lean();
    if(period.kind!=='monthly'){
     if(row)continue;
     const actor=await Admin.findById(user.assignedFamilyDoctor).lean();
     if(!actor||actor.role!=='familyDoctor'||actor.staffStatus==='inactive'||String(actor.tenantId)!==String(user.tenantId))continue;
     await require('./aiDataConsent').withStaffService(actor,()=>new Promise((resolve,reject)=>require('./tenantScope').tenantContext({staff:actor},null,()=>Promise.resolve().then(()=>require('./managementReviewPreparation').ensure({user,period,staff:actor,source:()=>require('../routes/managementReviews').sources(user,period)})).then(resolve,reject))));
     continue;
    }
    if(!row){
     const roles=['nutritionist','healthManager'];
     const rehab=await require('../models/HealthPlan').exists({patientId:user._id,type:'rehab',status:{$in:['active','completed']},pushedAt:{$ne:null,$lt:new Date(period.end+'T23:59:59+08:00')},$or:[{endDate:null},{endDate:{$gte:new Date(period.start+'T00:00:00+08:00')}}]});
     if(rehab){if(!user.assignedRehabSpecialist)continue;roles.push('rehabSpecialist');}
     try{row=(await Review.create({patientId:user._id,periodKey:period.key,kind:period.kind,label:period.label,start:period.start,end:period.end,focus:'待AI整理本期重点',roles,audit:[{action:'auto_created',at:now,note:'到期自动建立各岗位复盘'}]})).toObject();}
     catch(e){if(e.code!==11000)throw e;row=await Review.findOne({patientId:user._id,periodKey:period.key}).lean();}
    }
    const needed=missingDraftRoles(row);if(!needed.length||!canRetry(row,now))continue;
    await generateMissing({user,row,now,loadSource:require('../routes/managementReviews').sources,readActor:id=>Admin.findById(id).lean(),
     generate:args=>require('./managementReviewAI').generate({Review,...args}),
     withinActor:(actor,fn)=>require('./aiDataConsent').withStaffService(actor,()=>new Promise((resolve,reject)=>require('./tenantScope').tenantContext({staff:actor},null,()=>Promise.resolve().then(fn).then(resolve,reject))))});count+=needed.length;
   }catch(e){console.error('[management-review-auto] draft failed',e.code||e.statusCode||'GENERATION_FAILED');}
  }
 }
 return count;
 }finally{scanning=false;}
}
function start() {
 if(process.env.MANAGEMENT_REVIEW_MODE!=='allowlist')return;
 const run=()=>scan().catch(()=>console.error('[management-review-auto] scan failed'));
 setTimeout(run,15000).unref?.();setInterval(run,60*60*1000).unref?.();
}
module.exports={missingDraftRoles,canRetry,generateMissing,scan,start};
