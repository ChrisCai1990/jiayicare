const mongoose = require('mongoose');
// Durable processing ledger: survives staging expiry and prevents double confirmation.
const schema = new mongoose.Schema({
  groupId: {type: mongoose.Schema.Types.ObjectId, ref:'ServiceGroup', required:true},
  messageId: {type: mongoose.Schema.Types.ObjectId, required:true},
  patientId: {type: mongoose.Schema.Types.ObjectId, ref:'User', required:true},
  purpose: {type:String, enum:['checkin','report'], required:true},
  title: String, date: String, documentCategory: String,
  staffId: {type:mongoose.Schema.Types.ObjectId, ref:'Admin'},
  state: {type:String, enum:['processing','failed','archived'], default:'processing'},
  resultId: mongoose.Schema.Types.ObjectId,
  duplicate: Boolean,
}, {timestamps:true});
schema.index({groupId:1,messageId:1},{unique:true});
module.exports = mongoose.model('ServiceGroupReceipt',schema);
