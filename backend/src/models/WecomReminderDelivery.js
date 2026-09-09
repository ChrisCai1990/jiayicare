const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  staffId:{type:mongoose.Schema.Types.ObjectId,required:true}, day:{type:String,required:true},
  status:{type:String,enum:['claimed','sent','failed'],default:'claimed'},
  expiresAt:{type:Date,required:true},
},{timestamps:true});
schema.index({staffId:1,day:1},{unique:true});
schema.index({expiresAt:1},{expireAfterSeconds:0});
module.exports=mongoose.model('WecomReminderDelivery',schema);
