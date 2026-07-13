const mongoose = require('mongoose');

// 统一服务记录：就医协助、心理咨询、运动复健、中医评估、专科会诊
const serviceRecordSchema = new mongoose.Schema({
  // AI定时自动生成的草稿在专员审核前尚无明确负责人，故非必填；审核确认时补上审核人
  staffId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
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
      'doctor_followup',  // 医生随访记录（新，家庭医生日常沟通，非到院就医）
    ],
    required: true,
  },
  date:    { type: Date, default: Date.now },
  sourceHealthPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthPlan', default: null }, // 就医协助方案推送后自动生成时关联的方案
  // 通用字段
  title:   { type: String, default: '' },   // 记录标题/主题
  content: { type: String, default: '' },   // 详细内容记录
  result:  { type: String, default: '' },   // 结果/评估/建议
  nextDate:{ type: Date, default: null },   // 下次计划时间
  diseaseName: { type: String, default: '' }, // 专病名称（type=disease_mgmt时用于分组，如"巧克力囊肿""肺结节"）

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
    staffId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  }],

  // AI 从患者聊天记录提炼生成的随访草稿（routine/doctor_followup/nutrition 均可能来源于此）
  aiStatus:         { type: String, enum: ['pending', 'approved', null], default: null },
  aiSourceMessageIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  aiGeneratedAt:    { type: Date, default: null },
  aiRangeStart:     { type: Date, default: null }, // 本次草稿覆盖的聊天时间窗口起点，用于避免同一时段重复生成
  aiRangeEnd:       { type: Date, default: null },
}, { timestamps: true });

serviceRecordSchema.index({ patientId: 1, type: 1, date: -1 });
serviceRecordSchema.index({ staffId: 1, date: -1 });

module.exports = mongoose.model('ServiceRecord', serviceRecordSchema);
