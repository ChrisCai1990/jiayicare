const mongoose = require('mongoose');

const productShareSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  sharerType: { type: String, enum: ['customer', 'staff'], required: true },
  sharerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sharerStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  openedAt: { type: Date, default: null },
  claimedAt: { type: Date, default: null },
  convertedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  convertedAt: { type: Date, default: null },
  rewardStatus: { type: String, enum: ['none', 'pending', 'granted', 'reversed'], default: 'none' },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

productShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
productShareSchema.index({ recipientUserId: 1, productId: 1, createdAt: -1 });

module.exports = mongoose.model('ProductShare', productShareSchema);
