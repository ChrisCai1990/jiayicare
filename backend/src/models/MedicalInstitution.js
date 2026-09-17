const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  aliases: { type: [String], default: [] },
  level: { type: String, default: '' },
  nature: { type: String, enum: ['', 'public', 'private', 'other'], default: '' },
  region: { type: String, default: '' },
  address: { type: String, default: '' },
  campuses: { type: [String], default: [] },
  phone: { type: String, default: '' },
  cooperationStatus: { type: String, enum: ['none', 'contacting', 'cooperating'], default: 'none' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
}, { timestamps: true });

schema.index({ tenantId: 1, name: 1 }, { unique: true });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('MedicalInstitution', schema);
