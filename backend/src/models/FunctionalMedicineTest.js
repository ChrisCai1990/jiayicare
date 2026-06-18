const mongoose = require('mongoose');

const functionalMedicineTestSchema = new mongoose.Schema({
  name:               { type: String, required: true, trim: true },
  testResult:         { type: String, default: '' },  // 检测结果（描述/模板）
  indicatorAnalysis:  { type: String, default: '' },  // 指标分析
  managementAdvice:   { type: String, default: '' },  // 管理建议
  testTiming:         { type: String, default: '' },  // 检测时间
  institution:        { type: String, default: '' },  // 检测机构
  categoryId:         { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  status:             { type: String, enum: ['active', 'inactive'], default: 'active' },
  deleted:            { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('FunctionalMedicineTest', functionalMedicineTestSchema);
