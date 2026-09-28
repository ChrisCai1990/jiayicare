const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  resourceType: { type: String, enum: ['internal', 'external', 'joint'], required: true, default: 'internal', index: true },
  serviceItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceItem', default: null, index: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null, index: true },
  serviceScope: { type: [String], default: [] },
  cities: { type: [String], default: [] },
  deliveryOwner: { type: String, default: '', maxlength: 100 },
  contactName: { type: String, default: '', maxlength: 100 },
  contactPhone: { type: String, default: '', maxlength: 80 },
  sla: { type: String, default: '', maxlength: 500 },
  handoffChecklist: { type: String, default: '', maxlength: 2000 },
  procurementNote: { type: String, default: '', maxlength: 2000 },
  costPrice: { type: Number, default: 0, min: 0 },
  contractExpiresAt: { type: Date, default: null, index: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
}, { timestamps: true });

schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('MedicalDeliveryResource', schema);
