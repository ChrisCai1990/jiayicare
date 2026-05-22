const mongoose = require('mongoose');

const medicalReportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  type: {
    type: String,
    enum: [
      'annual',      // 年度体检
      'body_comp',   // 人体成分
      'blood',       // 血液检查
      'bloodTest',   // 血液检查（app端key，兼容）
      'ultrasound',  // 超声检查
      'radiology',   // 放射检查
      'mri',         // 磁共振
      'endoscopy',   // 内镜检查
      'ecg',         // 心电图
      'pathology',   // 病理报告
      'functional',  // 功能医学检测
      'genetic',     // 基因检测
      'other',       // 其他
      // 兼容旧数据
      'followup', 'imaging',
    ],
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
  // 审核状态（由管理员设置）
  audit_status: {
    type: String,
    enum: ['unaudited', 'audited', 'rejected'],
    default: 'unaudited',
  },
  audited_by:   { type: String, default: '' },
  audited_at:   { type: Date,   default: null },
  reject_reason:{ type: String, default: '' },
  // 医护端：上传人 & 关联方案项目
  uploadedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  planItemId:   { type: mongoose.Schema.Types.ObjectId, default: null }, // 关联体检方案中的项目
  planId:       { type: mongoose.Schema.Types.ObjectId, ref: 'HealthPlan', default: null },
}, { timestamps: true });

module.exports = mongoose.model('MedicalReport', medicalReportSchema);
