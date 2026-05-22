const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  title:       { type: String, required: true },
  type:        { type: String, enum: ['discount', 'gift', 'coupon', 'points'], default: 'discount' },
  description: { type: String, default: '' },
  // 折扣活动
  discountRate:  { type: Number, default: null }, // 0.8 = 八折
  minAmount:     { type: Number, default: 0 },
  // 赠品活动
  giftContent:   { type: String, default: '' },
  // 积分活动
  pointsBonus:   { type: Number, default: 0 },
  // 时间
  startDate:     { type: Date, default: null },
  endDate:       { type: Date, default: null },
  // 适用人群
  targetPatientType: { type: String, enum: ['all', 'vip', 'regular', 'trial'], default: 'all' },
  isActive:      { type: Boolean, default: true },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true });

module.exports = mongoose.model('Activity', activitySchema);
