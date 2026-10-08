const mongoose = require('mongoose');

const stageSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 100 },
  purpose: { type: String, default: '', maxlength: 2000 },
  owner: { type: String, default: '', maxlength: 100 },
  trigger: { type: String, default: '', maxlength: 1000 },
  handoff: { type: String, default: '', maxlength: 2000 },
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  programKey: { type: String, required: true, trim: true, maxlength: 60 },
  version: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  diseases: { type: [String], default: [] },
  overview: { type: String, default: '', maxlength: 4000 },
  serviceBoundary: { type: String, default: '', maxlength: 4000 },
  roles: { type: String, default: '', maxlength: 4000 },
  diaryGuide: { type: String, default: '', maxlength: 4000 },
  exceptionGuide: { type: String, default: '', maxlength: 4000 },
  stages: { type: [stageSchema], default: [] },
  sourceNote: { type: String, default: '', maxlength: 2000 },
  clinicalReviewer: { type: String, default: '', maxlength: 160 },
  publishedAt: { type: Date, default: null },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, programKey: 1, version: 1 }, { unique: true });
schema.index({ tenantId: 1, status: 1, updatedAt: -1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('SpecialtyLibrary', schema);
