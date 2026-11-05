const mongoose=require('mongoose');
const schema=new mongoose.Schema({patientId:{type:mongoose.Schema.Types.ObjectId,required:true},periodKey:{type:String,required:true},focus:String,questions:mongoose.Schema.Types.Mixed,includeRehab:{type:Boolean,default:false},source:String,generation:mongoose.Schema.Types.Mixed},{timestamps:true});
schema.index({patientId:1,periodKey:1},{unique:true});
module.exports=mongoose.model('ManagementReviewPreparation',schema);
