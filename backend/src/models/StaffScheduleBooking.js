const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  slotIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StaffAvailability', required: true }],
  originalSources: [{ type: String, enum: ['self', 'planner'] }],
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  category: { type: String, enum: ['customer_service', 'partner_exchange', 'other_affairs', 'service', 'communication', 'task', 'other'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  reason: { type: String, default: '', trim: true, maxlength: 300 },
  note: { type: String, default: '', maxlength: 1000 },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  relatedType: { type: String, enum: ['patient', 'product', 'order', 'service_record', 'follow_up', 'health_plan'], default: null },
  relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
  status: { type: String, enum: ['pending', 'scheduled', 'cancelling', 'cancelled'], default: 'pending' },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  cancelledAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, staffId: 1, startAt: 1, status: 1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('StaffScheduleBooking', schema);
