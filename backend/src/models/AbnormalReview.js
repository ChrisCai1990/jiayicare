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
  taskAssigneeSnapshot: { type: String, default: '' }, // Freeze the originating audit's task owner display name.
  auditDispatchVersion: { type: Number },
  auditDispatchDeletedAt: { type: Date },
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
}, { timestamps: true });

abnormalReviewSchema.index({ patientId: 1, status: 1 });
abnormalReviewSchema.index({ staffId: 1, createdAt: -1 });

// A stable audit-derived identity must survive removal to fence late insert-only
// workers. Ordinary/manual records retain their existing deletion behavior.
for (const operation of ['find', 'findOne', 'countDocuments', 'findOneAndUpdate']) {
  abnormalReviewSchema.pre(operation, function () {
    if (this.getOptions().includeAuditDeleted) return;
    this.where({ auditDispatchDeletedAt: null });
  });
}
for (const operation of ['deleteOne', 'deleteMany', 'findOneAndDelete']) {
  abnormalReviewSchema.pre(operation, { query: true, document: false }, function () {
    this.where({ auditDispatchVersion: { $ne: 1 } });
  });
}

module.exports = mongoose.model('AbnormalReview', abnormalReviewSchema);
