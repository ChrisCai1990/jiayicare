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
    enum: ['completed', 'missed', 'planned'],
    default: 'completed',
  },
  content: { type: String, default: '' },   // 随访内容记录
  theme:    { type: String, default: '' },  // 随访主题，如"日常血压监测"
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 负责人（可指定其他成员）
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
}, { timestamps: true });

followUpSchema.index({ staffId: 1, date: -1 });
followUpSchema.index({ patientId: 1, date: -1 });

module.exports = mongoose.model('FollowUp', followUpSchema);
