const mongoose = require('mongoose');

// 专项检查套餐（一组检验项目和/或检查医嘱的集合）
const labTestPackageSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  mnemonic:      { type: String, default: '', trim: true },
  remark:        { type: String, default: '' },
  labTestItems:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabTestItem' }],  // 关联检验项目
  specialExams:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'SpecialExam' }],  // 关联检查医嘱
  orders:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabTestOrder' }], // 兼容旧数据
  categoryId:    { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  status:        { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('LabTestPackage', labTestPackageSchema);
