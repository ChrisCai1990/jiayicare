const mongoose = require('mongoose');

// 服务项目（非检验类，如"专家咨询""陪诊"）
const serviceItemSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  mnemonic:    { type: String, default: '', trim: true },
  costPrice:   { type: Number, default: 0 },
  retailPrice: { type: Number, default: 0 },
  unit:                   { type: String, default: '次' },
  duration:               { type: Number, default: 0 }, // 保留旧字段
  participatesInDiscount: { type: Boolean, default: true },
  categoryId:             { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('ServiceItem', serviceItemSchema);
