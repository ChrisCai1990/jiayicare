const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 tenantId:{type:mongoose.Schema.Types.ObjectId,required:true},
 archiveId:{type:mongoose.Schema.Types.ObjectId,required:true},
 actorId:{type:mongoose.Schema.Types.ObjectId,ref:'Admin',required:true},
 purpose:{type:String,enum:['tax','accounting','statutory_audit'],required:true},
 reason:{type:String,required:true,maxlength:500},
 accessedAt:{type:Date,required:true},
 payloadHash:{type:String,required:true},
},{versionKey:false});
schema.index({tenantId:1,archiveId:1,accessedAt:-1});
// Append-only through the application. No public update/delete endpoint.
module.exports=mongoose.model('AccountDeletionArchiveAccess',schema);
