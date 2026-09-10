const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  staffId:{type:mongoose.Schema.Types.ObjectId,ref:'Admin',required:true,index:true},tenantId:{type:mongoose.Schema.Types.ObjectId,default:null},
  messageId:{type:String,required:true,unique:true},mediaId:{type:String,default:''},sourceUrl:{type:String,default:''},fileName:{type:String,default:''},mimeType:{type:String,default:''},
  status:{type:String,enum:['received','archived','duplicate','failed','needs_match'],default:'received'},instruction:{type:String,default:''},error:{type:String,default:''},reportId:{type:mongoose.Schema.Types.ObjectId,ref:'MedicalReport',default:null},expiresAt:{type:Date,required:true}
},{timestamps:true});
schema.index({expiresAt:1},{expireAfterSeconds:0});
module.exports=mongoose.model('WecomAppMaterial',schema);
