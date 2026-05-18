const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  serviceId:   { type: String, required: true },
  serviceName: { type: String, required: true },
  servicePrice:{ type: Number },
  serviceIcon: { type: String },
  note:        { type: String, default: '' },
  orderType:   { type: String, enum: ['service', 'package'], default: 'service' },
  status: {
    type: String,
    enum: ['pending', 'scheduled', 'completed', 'cancelled'],
    default: 'pending',
  },
  scheduledAt: { type: Date },
  completedAt: { type: Date },
}, { timestamps: true });

orderSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
