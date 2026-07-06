const mongoose = require('mongoose');

// 企业客户：B2B2C模式下，企业为员工批量采购健康管理服务
const enterpriseSchema = new mongoose.Schema({
  name:         { type: String, required: true }, // 企业名称
  creditCode:   { type: String, default: '' },     // 统一社会信用代码
  contactName:  { type: String, default: '' },     // 对接人姓名（企业侧HR/行政）
  contactPhone: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  logo:         { type: String, default: '' },
  // 合同信息
  contractStartAt: { type: Date, default: null },
  contractEndAt:   { type: Date, default: null },
  seatsTotal:      { type: Number, default: 0 },    // 采购名额总数
  packageType:     { type: String, default: '' },   // 采购的服务包类型，如 pkg_1y
  status:          { type: String, enum: ['active', 'expired', 'suspended'], default: 'active' },
  note:            { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Enterprise', enterpriseSchema);
