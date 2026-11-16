const Group=require('../models/InAppServiceGroup');
const Message=require('../models/InAppServiceGroupMessage');
const Delivery=require('../models/GroupMessageAlert');
const User=require('../models/User');
const Admin=require('../models/Admin');
const Link=require('../models/WecomAppLink');
const {assignedIds,same,canStaffAccess}=require('./inAppServiceGroupPolicy');
const {settings}=require('./wecomMessageAlerts');
const WINDOW=60000;
let running=false;
async function enqueue(message,config=settings()) {
 if(!config||message.senderType!=='customer')return;
 const group=await Group.findOne({_id:message.groupId,tenantId:message.tenantId,status:'active'}).lean();
 const patient=group&&await User.findOne({_id:group.patientId,tenantId:group.tenantId,isDeleted:{$ne:true}}).lean();
 if(!patient){await Message.updateOne({_id:message._id},{$set:{wecomAlertQueuedAt:new Date()}});return;}
 const members=(group.memberIds||[]).filter(id=>assignedIds(patient).some(value=>same(value,id)));
 const bucket=Math.floor(Date.now()/WINDOW);
 for(const staffId of members) {
  if(await Delivery.exists({groupId:group._id,staffId,messageIds:message._id}))continue;
  await Delivery.updateOne({groupId:group._id,staffId,bucket},{$setOnInsert:{tenantId:group.tenantId,dueAt:new Date((bucket+1)*WINDOW),status:'queued'},$addToSet:{messageIds:message._id}},{upsert:true});
 }
 await Message.updateOne({_id:message._id},{$set:{wecomAlertQueuedAt:new Date()}});
}
async function deliver(item,config) {
 const finish=(status,reason='')=>Delivery.updateOne({_id:item._id,status:'sending'},{$set:{status,reason,finishedAt:new Date()}});
 const [group,staff]=await Promise.all([Group.findById(item.groupId).lean(),Admin.findById(item.staffId).lean()]);
 const patient=group&&await User.findOne({_id:group.patientId,tenantId:item.tenantId,isDeleted:{$ne:true}}).lean();
 if(!same(group?.tenantId,item.tenantId)||!staff||staff.staffStatus!=='active'||staff.mustChangePassword||!canStaffAccess(group,patient,staff)||!(group.memberIds||[]).some(id=>same(id,staff._id)))return finish('skipped','membership_changed');
 if(staff.customRoleId){const role=await require('../models/StaffRole').findById(staff.customRoleId).select('permissions').lean();if(!require('./inAppServiceGroupPolicy').canUseGroupModule(role?.permissions))return finish('skipped','module_disabled');}
 const link=await Link.findOne({staffId:staff._id,tenantId:item.tenantId,corpId:process.env.WECOM_CORP_ID}).lean();
 if(!link?.userId)return finish('skipped','wecom_not_linked');
 try {
  const auth=await fetch('https://qyapi.weixin.qq.com/cgi-bin/gettoken?'+new URLSearchParams({corpid:process.env.WECOM_CORP_ID,corpsecret:process.env.WECOM_APP_SECRET}),{signal:AbortSignal.timeout(12000)});
  const token=await auth.json();if(!auth.ok||token.errcode||!token.access_token)throw Error('auth_failed');
  const response=await fetch('https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token='+encodeURIComponent(token.access_token),{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(12000),body:JSON.stringify({touser:link.userId,msgtype:'text',agentid:Number(process.env.WECOM_AGENT_ID),text:{content:`服务群有新的客户消息，请登录嘉医汇医护端查看。\n${config.origin}/in-app-service-groups?groupId=${group._id}`}})});
  const result=await response.json();if(!response.ok||result.errcode||result.invaliduser)throw Error('send_failed');
  await finish('sent');
 }catch(error){await finish('failed',['auth_failed','send_failed'].includes(error.message)?error.message:'network_failed');}
}
async function tick(){
 const config=settings();if(running||!config)return;running=true;
 try{
  // Only messages written after this feature is enabled in code are eligible.
  const missed=await Message.find({senderType:'customer',wecomAlertEligible:true,wecomAlertQueuedAt:null,createdAt:{$gte:config.startAt}}).sort({createdAt:1}).limit(100).lean();
  for(const message of missed)await enqueue(message,config);
  const pending=await Delivery.find({status:'queued',dueAt:{$lte:new Date()}}).sort({dueAt:1}).limit(50).lean();
  for(const candidate of pending){
   const item=await Delivery.findOneAndUpdate({_id:candidate._id,status:'queued'},{$set:{status:'sending'}},{new:true}).lean();
   if(item)try{await deliver(item,config);}catch{await Delivery.updateOne({_id:item._id},{$set:{status:'failed',reason:'processing_failed',finishedAt:new Date()}});}
  }
 }finally{running=false;}
}
function start(){if(!settings())return;const run=()=>tick().catch(()=>console.error('[group-alert] scan failed'));setImmediate(run);setInterval(run,10000).unref();}
module.exports={enqueue,deliver,tick,start};
