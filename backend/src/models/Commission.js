const mongoose = require('mongoose');

// 分佣记录
const commissionSchema = new mongoose.Schema({
  staffId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true }, // 推荐员工
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  default: null },  // 购买客户
  orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },  // 关联订单
  // 推荐链接
  referralCode: { type: String, default: '' },   // 专属推荐码
  // 分佣信息
  orderAmount:     { type: Number, default: 0 },  // 订单金额（元）
  commissionRate:  { type: Number, default: 0.05 }, // 分佣比例（0.05 = 5%）
  commissionAmount:{ type: Number, default: 0 },  // 分佣金额（元）
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'paid', 'cancelled'],
    default: 'pending',
  },
  paidAt:  { type: Date, default: null },
  remark:  { type: String, default: '' },
  // 产品信息摘要
  productName: { type: String, default: '' },
  productType: { type: String, default: '' }, // 'service_package' | 'service' | 'product'
}, { timestamps: true });

commissionSchema.index({ staffId: 1, createdAt: -1 });
commissionSchema.index({ referralCode: 1 });

module.exports = mongoose.model('Commission', commissionSchema);
