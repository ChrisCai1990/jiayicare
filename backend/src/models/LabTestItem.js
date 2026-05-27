const mongoose = require('mongoose');

// 检验项目（单个检验指标，如"空腹血糖"）
const labTestItemSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  mnemonic:       { type: String, default: '', trim: true }, // 助记码（拼音首字母）
  costPrice:      { type: Number, default: 0 },
  retailPrice:    { type: Number, default: 0 },
  unit:           { type: String, default: '' },
  referenceRange: { type: String, default: '' },
  categoryId:     { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  status:         { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('LabTestItem', labTestItemSchema);
