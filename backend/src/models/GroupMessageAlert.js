const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tenantId: {type:mongoose.Schema.Types.ObjectId,required:true},
  groupId: {type:mongoose.Schema.Types.ObjectId,required:true},
  staffId: {type:mongoose.Schema.Types.ObjectId,required:true},
  bucket: {type:Number,required:true},
  messageIds: [{type:mongoose.Schema.Types.ObjectId}],
  dueAt: Date,
  status: {type:String,enum:['queued','sending','sent','skipped','failed'],default:'queued'},
  reason: String, finishedAt: Date,
}, {timestamps:true});
schema.index({groupId:1,staffId:1,bucket:1},{unique:true});
schema.index({status:1,dueAt:1});
module.exports=mongoose.model('GroupMessageAlert',schema);
