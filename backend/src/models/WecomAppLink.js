const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  staffId:{type:mongoose.Schema.Types.ObjectId,ref:'Admin',required:true,unique:true},
  tenantId:{type:mongoose.Schema.Types.ObjectId,default:null},
  corpId:{type:String,required:true},
  userId:{type:String,default:undefined},
  pairHash:{type:String,select:false},
  pairExpires:Date,
  remindersEnabled:{type:Boolean,default:false},
  unbindRequestedAt:Date,
  unbindRequestedBy:{type:mongoose.Schema.Types.ObjectId,ref:'Admin',default:null},
  unbindRequestedUserId:String,
  lastUnboundAt:Date,
  lastUnboundBy:{type:mongoose.Schema.Types.ObjectId,ref:'Admin',default:null},
  lastUnboundByRole:{type:String,enum:['staff','superadmin']},
},{timestamps:true});
schema.index({corpId:1,userId:1},{unique:true,partialFilterExpression:{userId:{$type:'string'}}});
module.exports=mongoose.model('WecomAppLink',schema);
