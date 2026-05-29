const mongoose = require('mongoose');

const abnormalItemSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  value:     { type: String, default: '' },
  reference: { type: String, default: '' },
  severity:  { type: String, enum: ['mild', 'moderate', 'severe', ''], default: 'mild' },
}, { _id: false });

const abnormalReviewSchema = new mongoose.Schema({
  patientId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',          required: true },
  reportId:      { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport',  default: null },
  staffId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Admin',          required: true },
  title:         { type: String, default: '' },
  abnormalItems: [abnormalItemSchema],
  reviewDate:    { type: Date, default: null },
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

module.exports = mongoose.model('AbnormalReview', abnormalReviewSchema);
