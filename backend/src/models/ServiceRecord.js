const mongoose = require('mongoose');

// 统一服务记录：就医协助、心理咨询、运动复健、中医评估、专科会诊
const serviceRecordSchema = new mongoose.Schema({
  staffId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  type: {
    type: String,
    enum: [
      'medical_escort',   // 就医协助（代办/代诊/陪诊，旧）
      'psychology',       // 心理咨询（旧）
      'rehab',            // 运动复健（旧）
      'tcm',              // 中医评估（旧）
      'specialist',       // 专科会诊（旧）
      'disease_mgmt',     // 专病管理记录（新）
      'nutrition',        // 营养干预记录（新）
      'medical_visit',    // 医院就医记录（新）
      'routine',          // 日常随访记录（新）
    ],
    required: true,
  },
  date:    { type: Date, default: Date.now },
  // 通用字段
  title:   { type: String, default: '' },   // 记录标题/主题
  content: { type: String, default: '' },   // 详细内容记录
  result:  { type: String, default: '' },   // 结果/评估/建议
  nextDate:{ type: Date, default: null },   // 下次计划时间

  // 就医协助专属
  medicalEscort: {
    serviceType:{ type: String, enum: ['proxy_register', 'proxy_visit', 'accompany', ''], default: '' }, // 代办挂号/代诊/陪诊
    hospital:   { type: String, default: '' },
    department: { type: String, default: '' },
    doctor:     { type: String, default: '' },
    companion:  { type: String, default: '' }, // 陪诊人员
    diagnosis:  { type: String, default: '' }, // 诊断
    treatment:  { type: String, default: '' }, // 治疗方案
    serviceUsed:{ type: Number, default: 1 },  // 消耗服务次数
  },

  // 中医评估专属
  tcmRecord: {
    constitution: { type: String, default: '' }, // 体质辨识结果
    tcmAdvice:    { type: String, default: '' },  // 中医建议
    prescription: { type: String, default: '' },  // 中药/针灸方案
  },

  // 专科会诊专属
  specialistRecord: {
    specialty:    { type: String, default: '' }, // 专科领域
    consultType:  { type: String, default: '' }, // 会诊类型
    planId:       { type: mongoose.Schema.Types.ObjectId, ref: 'HealthPlan', default: null }, // 关联会诊记录
  },
  // 补充记录（事后追加的随访/补记）
  supplements: [{
    date:      { type: Date, default: Date.now },
    content:   { type: String, default: '' },
    staffName: { type: String, default: '' },
    staffId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
  }],
}, { timestamps: true });

serviceRecordSchema.index({ patientId: 1, type: 1, date: -1 });
serviceRecordSchema.index({ staffId: 1, date: -1 });

module.exports = mongoose.model('ServiceRecord', serviceRecordSchema);
