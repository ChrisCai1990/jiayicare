const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键，创建时从 user.tenantId 冗余存一份）
  serviceId:   { type: String, required: true },
  serviceName: { type: String, required: true },
  servicePrice:{ type: Number },
  serviceIcon: { type: String },
  note:        { type: String, default: '' },
  orderType:   { type: String, enum: ['service', 'package', 'product'], default: 'service' },
  pushRecordId:{ type: mongoose.Schema.Types.ObjectId, ref: 'PushRecord', default: null },
  status: {
    type: String,
    enum: ['pending', 'scheduled', 'completed', 'cancelled'],
    default: 'pending',
  },
  scheduledAt: { type: Date },
  completedAt: { type: Date },
}, { timestamps: true });

orderSchema.index({ user: 1, createdAt: -1 });

orderSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('Order', orderSchema);
