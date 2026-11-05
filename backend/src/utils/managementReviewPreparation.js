const {randomUUID}=require('crypto');
async function ensure({user,period,staff,source,includeRehab=false,force=false,Model=require('../models/ManagementReviewPreparation'),prepare=require('./managementReviewAI').prepare}){
 const key={patientId:user._id,periodKey:period.key};
 let row=await Model.findOne(key).lean();
 if(row?.focus&&!force)return row;
 if(row?.generation?.status==='running'&&Date.now()-new Date(row.generation.startedAt).getTime()<180000)throw Object.assign(new Error('AI正在自动准备，请稍后刷新'),{statusCode:409});
 if(!force&&row?.generation?.status==='failed'&&Date.now()-new Date(row.generation.at).getTime()<21600000)return row;
 if(!row){try{row=(await Model.create(key)).toObject()}catch(e){if(e.code!==11000)throw e;throw Object.assign(new Error('草稿正在准备，请稍后刷新'),{statusCode:409})}}
 const token=randomUUID();
 const locked=await Model.findOneAndUpdate({_id:row._id,__v:row.__v},{$set:{generation:{status:'running',startedAt:new Date(),token}},$inc:{__v:1}},{new:true});
 if(!locked)throw Object.assign(new Error('草稿已更新，请刷新'),{statusCode:409});
 try{
 const roles=['nutritionist','healthManager','familyDoctor',...(includeRehab?['rehabSpecialist']:[])];
 const draft=await prepare({user,period,staff,source:await source(),roles});
 const saved=await Model.findOneAndUpdate({_id:row._id,'generation.token':token},{$set:{...draft,includeRehab,generation:{status:'completed',at:new Date()}},$inc:{__v:1}},{new:true});
 if(!saved)throw new Error('草稿已更新，请刷新');return saved;
 }catch(e){await Model.updateOne({_id:row._id,'generation.token':token},{$set:{generation:{status:'failed',at:new Date()}},$inc:{__v:1}});throw e}
}
module.exports={ensure};
