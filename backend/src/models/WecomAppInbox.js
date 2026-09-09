const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  staffId:{type:mongoose.Schema.Types.ObjectId,ref:'Admin',required:true,index:true},
  tenantId:{type:mongoose.Schema.Types.ObjectId,default:null},
  messageId:{type:String,required:true,unique:true},
  payload:{type:String,required:true,select:false},
  expiresAt:{type:Date,required:true},
},{timestamps:true});
schema.index({expiresAt:1},{expireAfterSeconds:0});
module.exports=mongoose.model('WecomAppInbox',schema);
