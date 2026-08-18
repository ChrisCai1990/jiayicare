const mongoose = require('mongoose');

const abnormalItemSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  value:     { type: String, default: '' },
  reference: { type: String, default: '' },
  severity:  { type: String, enum: ['mild', 'moderate', 'severe', ''], default: 'mild' },
}, { _id: false });

const abnormalReviewSchema = new mongoose.Schema({
  patientId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User',          required: true },
  reportId:         { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport',  default: null },
  staffId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Admin',          required: true },
  taskId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Task',           default: null },
  title:            { type: String, default: '' },
  reviewReason:     { type: String, default: '' },
  reviewHospital:   { type: String, default: '' },
  reviewDepartment: { type: String, default: '' },
  abnormalItems:    [abnormalItemSchema],
  reviewDate:       { type: Date, default: null },
  status: {
    type: String,
    enum: ['pending', 'scheduled', 'completed', 'cancelled'],
    default: 'pending',
  },
  notes:        { type: String, default: '' },
  resolvedAt:   { type: Date, default: null },
  resolvedNote: { type: String, default: '' },
  // 报告审核请求派生的复查记录使用此键防止中断重试重复创建。
  sourceReviewRequestId: { type: String },
}, { timestamps: true });

abnormalReviewSchema.index({ patientId: 1, status: 1 });
abnormalReviewSchema.index({ staffId: 1, createdAt: -1 });
abnormalReviewSchema.index({ sourceReviewRequestId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('AbnormalReview', abnormalReviewSchema);
