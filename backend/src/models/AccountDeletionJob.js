const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 requestId:{type:mongoose.Schema.Types.ObjectId,required:true,unique:true},
 userId:{type:mongoose.Schema.Types.ObjectId,required:true},
 tenantId:{type:mongoose.Schema.Types.ObjectId,required:true},
 manifestHash:{type:String,required:true},
 manifest:{type:mongoose.Schema.Types.Mixed,required:true,select:false},
 state:{type:String,enum:['prepared','running','failed','completed'],default:'prepared'},
 // No automatic lease expiry: a timed-out writer may still resume. Recovery must first
 // prove that the previous execution process has stopped while the write fence is held.
 leaseToken:{type:String,default:'',select:false},
 leaseStartedAt:{type:Date,default:null},
 checkpoints:{type:mongoose.Schema.Types.Mixed,default:{}},
 failureCode:{type:String,default:''},
 completedAt:{type:Date,default:null},
 completionEvidence:{type:String,default:''},
},{timestamps:true});
schema.index({tenantId:1,state:1,createdAt:1});
module.exports=mongoose.model('AccountDeletionJob',schema);
