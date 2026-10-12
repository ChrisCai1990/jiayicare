const mongoose = require('mongoose');

const enterpriseServiceRecordSchema = new mongoose.Schema({
  enterpriseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
  year: { type: Number, required: true, min: 2020, max: 2099 },
  period: { type: String, enum: ['annual', 'Q1', 'Q2', 'Q3', 'Q4'], required: true },
  kind: { type: String, enum: ['annual_plan', 'quarterly_review', 'annual_review', 'other'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  summary: { type: String, default: '', maxlength: 2000 },
  file: {
    name: { type: String, required: true },
    key: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  publishedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });

enterpriseServiceRecordSchema.index({ enterpriseId: 1, year: -1, createdAt: -1 });

module.exports = mongoose.model('EnterpriseServiceRecord', enterpriseServiceRecordSchema);
