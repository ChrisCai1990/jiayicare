const mongoose = require('mongoose');
const { Schema } = mongoose;

const couponSchema = new Schema({
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  staffId:   { type: Schema.Types.ObjectId, ref: 'Admin', required: true }, // 发放人
  type:      { type: String, enum: ['amount', 'percent'], required: true }, // 满减面额 / 折扣
  value:     { type: Number, required: true }, // amount: 抵扣元数；percent: 折扣(如90表示9折)
  title:     { type: String, default: '' },    // 展示名，如"新客立减券"
  minSpend:  { type: Number, default: 0 },      // 最低消费门槛（订单原价需 >= 此值才能用）
  validFrom: { type: Date, default: null },
  validTo:   { type: Date, default: null },
  status:    { type: String, enum: ['active', 'used', 'expired'], default: 'active' },
  usedAt:      { type: Date, default: null },
  usedOrderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
  remark:    { type: String, default: '' },
}, { timestamps: true });

couponSchema.index({ patientId: 1, status: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
