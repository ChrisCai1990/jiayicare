const mongoose = require('mongoose');

// 合作伙伴权益：客户按会员等级可见的免费/优惠权益条目
const partnerBenefitSchema = new mongoose.Schema({
  partner:      { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  title:        { type: String, required: true },
  subtitle:     { type: String, default: '' },
  images:       [{ type: String }],
  description:  { type: String, default: '' }, // 权益详情（富文本/多段文字）
  usageGuide:   { type: String, default: '' },  // 使用说明（如何核销/预约方式）
  visibleMemberTypes: [{ type: String }], // 可见的会员等级名称列表，空数组=所有会员可见
  status:       { type: String, enum: ['on', 'off'], default: 'on' },
  sortOrder:    { type: Number, default: 999 },
}, { timestamps: true });

module.exports = mongoose.model('PartnerBenefit', partnerBenefitSchema);
