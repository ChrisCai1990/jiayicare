const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 patientId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 periodKey:{type:String,required:true},kind:{type:String,enum:['monthly','quarterly','annual'],required:true},
 label:String,start:String,end:String,
 status:{type:String,enum:['collecting','advisor_review','finalized'],default:'collecting'},
 focus:{type:String,default:''},roles:[String],questions:{type:mongoose.Schema.Types.Mixed,default:{}},
 contributions:{type:mongoose.Schema.Types.Mixed,default:{}},
 generation:{type:mongoose.Schema.Types.Mixed,default:null},summaryDraft:{type:mongoose.Schema.Types.Mixed,default:null},
 summary:{type:String,default:''},nextPlan:{type:String,default:''},
 actions:[{title:String,role:String,dueAt:String,status:{type:String,default:'pending'},completedAt:Date,completedBy:{type:mongoose.Schema.Types.ObjectId,ref:'Admin'}}],
 sources:{type:mongoose.Schema.Types.Mixed,default:{}},
 finalizedAt:Date,finalizedBy:{type:mongoose.Schema.Types.ObjectId,ref:'Admin'},
 audit:[{action:String,role:String,by:{type:mongoose.Schema.Types.ObjectId,ref:'Admin'},at:Date,note:String,snapshot:mongoose.Schema.Types.Mixed}]
},{timestamps:true,optimisticConcurrency:true});
schema.index({patientId:1,periodKey:1},{unique:true});
module.exports=mongoose.model('ManagementReview',schema);
