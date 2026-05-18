const mongoose = require('mongoose');

const medicalReportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  type: {
    type: String,
    enum: ['annual', 'followup', 'ecg', 'blood', 'imaging'],
    default: 'annual',
  },
  hospital:    { type: String, default: '' },
  date:        { type: String, default: '' },
  pages:       { type: Number, default: 1 },
  fileSize:    { type: String, default: '' },
  fileUrl:     { type: String, default: '' },
  keyFindings: [{ type: String }],
  status: {
    type: String,
    enum: ['pending', 'analyzed', 'normal', 'abnormal'],
    default: 'pending',
  },
  note:    { type: String, default: '' },
  // 文件预览内容（data URI，仅小文件 < 3MB 存储，用于前端预览）
  content: { type: String, default: '' },
  mimeType:{ type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('MedicalReport', medicalReportSchema);
