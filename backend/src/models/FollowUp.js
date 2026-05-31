const mongoose = require('mongoose');

const followUpSchema = new mongoose.Schema({
  staffId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true }, // 随访人
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true }, // 患者
  date:      { type: Date, default: Date.now },
  type: {
    type: String,
    enum: ['phone', 'wechat', 'visit', 'video', 'other'],
    default: 'phone',
  },
  status: {
    type: String,
    enum: ['completed', 'missed', 'planned', 'in_progress', 'cancelled'],
    default: 'completed',
  },
  content:      { type: String, default: '' },  // 随访内容记录
  theme:        { type: String, default: '' },  // 随访主题
  followUpSchemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'FollowUpPlan', default: null },
  formData:     { type: mongoose.Schema.Types.Mixed, default: null },
  cancelReason: { type: String, default: '' },  // 取消原因（cancelled 时必填）
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 负责人
  nextFollowUpDate: { type: Date, default: null },
  tags:     { type: [String], default: [] }, // 标签，如 ['用药提醒','复查提示']
  // 随访时记录的简要体征
  vitals: {
    systolic:  { type: Number },  // 收缩压
    diastolic: { type: Number },  // 舒张压
    bloodSugar:{ type: Number },  // 血糖 mmol/L
    weight:    { type: Number },  // 体重 kg
    heartRate: { type: Number },  // 心率
  },
  // 用户端今日打卡项目（由医护端创建随访计划时指定）
  checkInItems: {
    type: [String],
    default: [],
    // 可选值：bloodPressure / bloodSugar / heartRate / weight / sleep / diet / exercise / water / alcohol
  },
}, { timestamps: true });

followUpSchema.index({ staffId: 1, date: -1 });
followUpSchema.index({ patientId: 1, date: -1 });

module.exports = mongoose.model('FollowUp', followUpSchema);
