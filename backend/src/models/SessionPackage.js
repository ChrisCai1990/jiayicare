const mongoose = require('mongoose');

const sessionPackageSchema = new mongoose.Schema({
  name:          { type: String, required: true },   // 如"10次陪诊卡"
  serviceType:   { type: String, default: '' },      // medical_escort / tcm / rehab 等
  count:         { type: Number, required: true },   // 次数
  price:         { type: Number, required: true },   // 售价（元）
  originalPrice: { type: Number, default: 0 },       // 划线价
  validDays:     { type: Number, default: 365 },     // 有效天数
  description:   { type: String, default: '' },
  isActive:      { type: Boolean, default: true },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true });

module.exports = mongoose.model('SessionPackage', sessionPackageSchema);
