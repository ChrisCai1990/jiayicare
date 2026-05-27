const mongoose = require('mongoose');

// 检验套餐（一组检验医嘱，如"年度基础体检包"）
const labTestPackageSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  mnemonic:    { type: String, default: '', trim: true },
  costPrice:   { type: Number, default: 0 },
  retailPrice: { type: Number, default: 0 },
  unit:        { type: String, default: '' },
  orders:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabTestOrder' }],
  categoryId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('LabTestPackage', labTestPackageSchema);
