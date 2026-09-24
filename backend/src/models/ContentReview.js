const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending', 'approved', 'returned'], default: 'pending' },
  note: { type: String, default: '', maxlength: 2000 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedByName: { type: String, default: '', maxlength: 60 },
  reviewedAt: { type: Date, default: null },
}, { _id: false });

const contentReviewSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, trim: true },
  title: { type: String, required: true, maxlength: 120 },
  summary: { type: String, default: '', maxlength: 500 },
  // 审核快照与公开 GEO 文件分离：审核通过前绝不进入公开站点。
  sourceContent: { type: String, default: '', maxlength: 12000 },
  sourceUpdatedAt: { type: String, default: '' },
  reviewChain: [{ type: String, enum: ['nutritionist', 'familyDoctor'] }],
  currentRole: { type: String, enum: ['nutritionist', 'familyDoctor', 'healthPlanner', ''], default: '', index: true },
  status: { type: String, enum: ['pending', 'changes_requested', 'ready_to_publish', 'publish_confirmed', 'approved'], default: 'pending', index: true },
  nutritionReview: { type: reviewSchema, default: () => ({}) },
  doctorReview: { type: reviewSchema, default: () => ({}) },
  publishChecklist: {
    professionalReviewCompleted: { type: Boolean, default: false },
    contentAndBoundaryChecked: { type: Boolean, default: false },
    contactAndLinksChecked: { type: Boolean, default: false },
    privacyChecked: { type: Boolean, default: false },
    scopeChecked: { type: Boolean, default: false },
    checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    checkedByName: { type: String, default: '' },
    checkedAt: { type: Date, default: null },
  },
  auditLog: [{ action: String, role: String, note: String, by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, byName: String, at: Date }],
}, { timestamps: true });

contentReviewSchema.index({ status: 1, currentRole: 1, updatedAt: -1 });

module.exports = mongoose.model('ContentReview', contentReviewSchema);
