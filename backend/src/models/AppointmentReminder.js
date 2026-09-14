const mongoose = require('mongoose');

const appointmentReminderSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['day_before', 'two_hours_before'], required: true },
  remindAt: { type: Date, required: true, index: true },
  appointmentAt: { type: Date, required: true },
  appointmentText: { type: String, required: true },
  status: { type: String, enum: ['pending', 'processing', 'sent', 'cancelled'], default: 'pending', index: true },
  processingAt: { type: Date, default: null },
  sentAt: { type: Date, default: null },
}, { timestamps: true });

appointmentReminderSchema.index({ orderId: 1, kind: 1 }, { unique: true });

module.exports = mongoose.model('AppointmentReminder', appointmentReminderSchema);
