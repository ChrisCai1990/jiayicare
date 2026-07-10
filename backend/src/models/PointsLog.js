const mongoose = require('mongoose');
const { Schema } = mongoose;

const pointsLogSchema = new Schema({
  user:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true }, // 正数=获得，负数=消耗（兑换预留）
  source: { type: String, enum: ['checkin', 'consumption', 'redeem', 'adjust'], required: true },
  // checkin: 打卡获得；consumption: 消费获得；redeem: 积分兑换消耗；adjust: 医护/超管手动调整
  refType: { type: String, default: '' }, // 关联对象类型，如 'HealthRecord' | 'Order'
  refId:   { type: Schema.Types.ObjectId, default: null }, // 关联对象ID
  remark:  { type: String, default: '' },
}, { timestamps: true });

pointsLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('PointsLog', pointsLogSchema);
