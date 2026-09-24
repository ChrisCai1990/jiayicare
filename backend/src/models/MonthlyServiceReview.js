const mongoose = require('mongoose');

const actionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  dueAt: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  completedAt: { type: Date, default: null },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { _id: true });

const monthlyServiceReviewSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  annualPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'AnnualPlan', required: true },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  status: { type: String, enum: ['draft', 'confirmed'], default: 'draft' },
  facts: { type: mongoose.Schema.Types.Mixed, default: null },
  sections: {
    healthProgress: { type: String, default: '' },
    serviceExecution: { type: String, default: '' },
    customerFeedback: { type: String, default: '' },
    teamCollaboration: { type: String, default: '' },
    unresolvedIssues: { type: String, default: '' },
  },
  contributions: [{
    section: { type: String, required: true },
    content: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    at: { type: Date, default: Date.now },
  }],
  actions: [actionSchema],
  confirmedAt: { type: Date, default: null },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  corrections: [{ content: String, by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, at: Date }],
  auditLog: [{ action: String, by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, at: Date }],
}, { timestamps: true });

monthlyServiceReviewSchema.index({ patientId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyServiceReview', monthlyServiceReviewSchema);
