const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  status: { type: String, enum: ['available', 'booked', 'unavailable'], default: 'available' },
  source: { type: String, enum: ['self', 'planner', 'consultation'], default: 'self' },
  bookingId: { type: mongoose.Schema.Types.ObjectId, default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });

schema.index({ tenantId: 1, staffId: 1, startAt: 1, endAt: 1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('StaffAvailability', schema);
