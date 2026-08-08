const mongoose = require('mongoose');

const fulfillmentSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['offline_service', 'remote_service', 'delivery_and_service', 'subscription_service', 'digital_content'],
    default: 'offline_service',
  },
  status: {
    type: String,
    enum: ['pending_assignment', 'awaiting_booking', 'booked', 'awaiting_shipment', 'shipped', 'in_service', 'completed', 'cancelled'],
    default: 'pending_assignment',
    index: true,
  },
  assignedStaff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }],
  bookingTime: { type: Date, default: null },
  serviceLocation: { type: String, default: '' },
  deliveryCompany: { type: String, default: '' },
  trackingNo: { type: String, default: '' },
  wechatDeliveryStatus: { type: String, enum: ['not_reported', 'reported', 'failed'], default: 'not_reported' },
  wechatDeliveryReportedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  note: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Fulfillment', fulfillmentSchema);
