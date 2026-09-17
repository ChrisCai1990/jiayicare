const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalInstitution', required: true, index: true },
  campus: { type: String, default: '' },
  name: { type: String, required: true, trim: true },
  specialties: { type: [String], default: [] },
  introduction: { type: String, default: '' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
}, { timestamps: true });

schema.index({ tenantId: 1, institutionId: 1, campus: 1, name: 1 }, { unique: true });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('MedicalDepartment', schema);
