const mongoose=require('mongoose');

// 外部微信身份不能凭昵称、手机号或群名推断到健康档案；必须由有权限的员工明确绑定。
const schema=new mongoose.Schema({
  corpId:{type:String,required:true,index:true},
  externalUserId:{type:String,required:true},
  user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
  boundBy:{type:mongoose.Schema.Types.ObjectId,ref:'Admin',default:null},
  boundAt:{type:Date,default:Date.now},
  consentAt:{type:Date,default:null},
  active:{type:Boolean,default:true},
},{timestamps:true});
schema.index({corpId:1,externalUserId:1},{unique:true});
module.exports=mongoose.model('WecomKfContact',schema);
