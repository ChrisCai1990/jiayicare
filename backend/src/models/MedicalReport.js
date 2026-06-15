const mongoose = require('mongoose');

// 报告解析后的单条项目（检验/检查值）
const reportItemSchema = new mongoose.Schema({
  name:           { type: String, default: '' }, // 项目名称
  value:          { type: String, default: '' }, // 检测值（字符串保留原始格式）
  unit:           { type: String, default: '' }, // 单位
  referenceRange: { type: String, default: '' }, // 参考范围
  status:         { type: String, enum: ['normal', 'abnormal', 'attention', 'unknown'], default: 'unknown' },
  itemType:       { type: String, enum: ['lab', 'imaging', 'data'], default: 'lab' }, // 检验/影像文字/数据曲线类
}, { _id: false });

const medicalReportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },

  // ── 年度/类目结构（需求23）───────────────────────────────────────
  reportYear:      { type: Number, default: null },   // 报告年份（如 2025）
  checkDate:       { type: String, default: '' },     // 检查日期
  institution:     { type: String, default: '' },     // 检查机构
  screeningCategory: {
    type: String,
    enum: ['tumor', 'cardiovascular', 'brain_vessel', 'chronic', 'functional', 'other_routine', 'health_promote', 'infectious', 'hormone', ''],
    default: '',
  },
  screeningL1: { type: String, default: '' }, // 第一层大类 key（如 'tumor'）
  screeningL2: { type: String, default: '' }, // 第二层分类名（如 '胃癌早筛'）
  screeningL3: { type: String, default: '' }, // 第三层项目名（如 '胃镜检查'）
  reportItems:     [reportItemSchema],                // 解析后的各项结果
  aiSummary:       { type: String, default: '' },     // AI 趋势分析文字
  aiStatus:        { type: String, enum: ['none', 'pending', 'reviewed', 'rejected'], default: 'none' },
  reviewedByStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedAt:      { type: Date, default: null },
  reviewNote:      { type: String, default: '' },

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
      // 专项筛查分类
      'tumor', 'cardiovascular', 'chronic', 'functional', 'health_promote',
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
  planItemId:       { type: mongoose.Schema.Types.ObjectId, default: null }, // 关联体检方案中的项目
  planId:           { type: mongoose.Schema.Types.ObjectId, ref: 'HealthPlan', default: null },
  screeningItemId:  { type: mongoose.Schema.Types.ObjectId, ref: 'UserScreeningItem', default: null },
}, { timestamps: true });

module.exports = mongoose.model('MedicalReport', medicalReportSchema);
