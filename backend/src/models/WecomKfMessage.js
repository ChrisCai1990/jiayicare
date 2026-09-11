const mongoose=require('mongoose');

// 仅保留微信客服必要的传输与审计元数据。正文由 ChatLog（仅已绑定客户）保留，
// 未绑定外部客户不把原文写入健康档案。
const schema=new mongoose.Schema({
  corpId:{type:String,required:true,index:true},
  msgId:{type:String,required:true},
  openKfId:{type:String,required:true,index:true},
  externalUserId:{type:String,default:'',index:true},
  messageType:{type:String,default:''},
  direction:{type:String,enum:['customer','assistant'],required:true},
  status:{type:String,enum:['received','replied','handoff','ignored','failed'],default:'received'},
  replyKind:{type:String,enum:['ai','safe_notice','unbound_notice','image_notice',''],default:''},
  // 只在员工明确绑定且触发人工接管时关联。待办不复制客户原文，避免扩大健康数据暴露面。
  user:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null,index:true},
  followUp:{type:mongoose.Schema.Types.ObjectId,ref:'FollowUp',default:null,index:true},
  errorCode:{type:String,default:''},
  expiresAt:{type:Date,required:true,index:{expireAfterSeconds:0}},
},{timestamps:true});
schema.index({corpId:1,msgId:1},{unique:true});
module.exports=mongoose.model('WecomKfMessage',schema);
