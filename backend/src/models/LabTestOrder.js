const mongoose = require('mongoose');

// 检验医嘱（一组检验项目，如"血脂全套"）
const labTestOrderSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  mnemonic:    { type: String, default: '', trim: true },
  costPrice:   { type: Number, default: 0 },
  retailPrice: { type: Number, default: 0 },
  unit:                   { type: String, default: '' },
  items:                  [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabTestItem' }],
  participatesInDiscount: { type: Boolean, default: true },
  remark:                 { type: String, default: '' },
  categoryId:             { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  status:                 { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('LabTestOrder', labTestOrderSchema);
