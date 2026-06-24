const mongoose = require('mongoose');

// 报告解析后的单条项目（检验/检查值）
const reportItemSchema = new mongoose.Schema({
  name:           { type: String, default: '' }, // 项目名称
  value:          { type: String, default: '' }, // 检测值（字符串保留原始格式）
  unit:           { type: String, default: '' }, // 单位
  referenceRange: { type: String, default: '' }, // 参考范围
  status:         { type: String, enum: ['normal', 'abnormal', 'attention', 'unknown'], default: 'unknown' },
  itemType:       { type: String, enum: ['lab', 'imaging', 'data'], default: 'lab' }, // 检验/影像文字/数据曲线类
  orderName:      { type: String, default: '' }, // 所属检验医嘱组名（用于编辑时还原分组）

  // ── 检查项目（imaging：超声/内镜/CT/MRI/心电图等）完整内容（需求：AI体检报告·检查项完整展示）──
  bodyPart:    { type: String, default: '' }, // 检查部位
  findings:    { type: String, default: '' }, // 检查所见（完整原文，禁止截断）
  diagnosis:   { type: String, default: '' }, // 诊断意见（完整原文）
  examDate:    { type: String, default: '' }, // 检查时间（item 级，空则回退报告级 checkDate）
  institution: { type: String, default: '' }, // 检查机构（item 级，空则回退报告级 institution）

  // ── 专项筛查自动归类标记（批次2 匹配引擎写入；批次1 先建字段）──
  screeningKey:      { type: String, default: '' }, // 命中筛查树节点 id：`category|parent|label`
  screeningCategory: { type: String, default: '' }, // 一级分类 key（tumor/cardiovascular/...）
  screeningParent:   { type: String, default: '' }, // 二级（如「肺癌」）
  matchStatus:       { type: String, enum: ['matched', 'unclassified'], default: 'unclassified' },
  matchConfidence:   { type: Number, default: 0 },   // 匹配置信度 0-1
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
  screeningL1: { type: String, default: '' },
  screeningL2: { type: String, default: '' },
  screeningL3: { type: String, default: '' },
  screeningL3Items: [{ type: String }],
  examDescription: { type: String, default: '' }, // 检查医嘱：检查描述（给医生看的说明）
  examConclusion:  { type: String, default: '' }, // 检查医嘱：诊断结论模板
  reportItems:     [reportItemSchema],                // 解析后的各项结果
  aiSummary:       { type: String, default: '' },     // AI 趋势分析文字
  aiStatus:        { type: String, enum: ['none', 'processing', 'pending', 'reviewed', 'rejected'], default: 'none' },
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
  ossKey:      { type: String, default: '' },  // OSS 对象路径，删除时用于清理
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
