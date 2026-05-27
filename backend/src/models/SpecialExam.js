const mongoose = require('mongoose');

// 特殊检查项目（超声、影像、内镜、磁共振等）
const specialExamSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  mnemonic:       { type: String, default: '', trim: true },
  examType:       { type: String, enum: ['ultrasound', 'radiology', 'mri', 'endoscopy', 'pathology', 'other'], required: true },
  bodyPart:       { type: String, default: '' },
  costPrice:      { type: Number, default: 0 },
  retailPrice:    { type: Number, default: 0, required: true },
  unit:           { type: String, default: '次' },
  referenceRange: { type: String, default: '' },
  categoryId:     { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  status:         { type: String, enum: ['active', 'inactive'], default: 'active' },
  sortOrder:      { type: Number, default: 0 },
  deleted:        { type: Boolean, default: false }, // 软删除
}, { timestamps: true });

module.exports = mongoose.model('SpecialExam', specialExamSchema);
