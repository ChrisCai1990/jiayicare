const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'InAppServiceGroup', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderType: { type: String, enum: ['customer', 'staff', 'ai'], required: true },
  quotedMessageId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
  wecomAlertEligible: { type:Boolean, default:false },
  wecomAlertQueuedAt: Date,
  staffPushEligible: { type: Boolean, default: false },
  staffPushQueuedAt: Date,
  replyTo: { type: mongoose.Schema.Types.ObjectId, default: undefined },
  senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  senderName: { type: String, required: true, maxlength: 120 },
  content: { type: String, required: true, maxlength: 2000 },
  fileUrl: {type:String,default:''},
  fileName: {type:String,default:''},
  fileMimeType: {type:String,default:''},
  fileSize: {type:Number,default:0},
  audioUrl: {type:String,default:''},
  audioMimeType: {type:String,default:''},
  audioDuration: {type:Number,default:0},
  audioTranscript: {type:String,default:''},
  materialReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', default: undefined },
  mentions: [{ _id: false, id: mongoose.Schema.Types.ObjectId, kind: { type: String, enum: ['staff', 'customer', 'ai'] }, name: String, role: String }],
  mentionReadBy: [{ type: mongoose.Schema.Types.ObjectId }],
  eventKey: { type: String, default: undefined },
}, { timestamps: true });
schema.index({ groupId: 1, createdAt: -1 });
schema.index({ wecomAlertEligible: 1, wecomAlertQueuedAt: 1, createdAt: 1 });
schema.index({ staffPushEligible: 1, staffPushQueuedAt: 1, createdAt: 1 });
schema.index({ replyTo: 1 }, { unique: true, sparse: true });
schema.index({ eventKey: 1 }, { unique: true, sparse: true });
schema.index({ tenantId: 1, 'mentions.id': 1, createdAt: -1 });

module.exports = mongoose.model('InAppServiceGroupMessage', schema);
