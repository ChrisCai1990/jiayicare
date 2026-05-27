const mongoose = require('mongoose');

// 检验项目（单个检验指标，如"空腹血糖"）
const labTestItemSchema = new mongoose.Schema({
  name:                   { type: String, required: true, trim: true },
  mnemonic:               { type: String, default: '', trim: true },
  costPrice:              { type: Number, default: 0 },
  retailPrice:            { type: Number, default: 0 },
  unit:                   { type: String, default: '' },
  specimenType:           { type: String, default: '' }, // 标本种类，如"血清""全血"
  tubeColor:              { type: String, default: '' }, // 试管颜色，如"紫色管"
  reportTime:             { type: String, default: '' }, // 报告时间，如"2小时"
  participatesInDiscount: { type: Boolean, default: true }, // 是否参与优惠
  dataType:               { type: String, enum: ['quantitative', 'qualitative', 'custom'], default: 'quantitative' }, // 定量/定性/自定义
  referenceValue:         { type: String, default: '' }, // 参考值（根据数据类型动态）
  criticalValue:          { type: String, default: '' }, // 危急值
  abnormalValue:          { type: String, default: '' }, // 异常值
  clinicalSuggestion:     { type: String, default: '' }, // 结论建议
  referenceRange:         { type: String, default: '' }, // 兼容旧字段
  categoryId:             { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  status:                 { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('LabTestItem', labTestItemSchema);
