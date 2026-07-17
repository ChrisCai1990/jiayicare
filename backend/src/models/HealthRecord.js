const mongoose = require('mongoose');

const healthRecordSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键）
  category: { type: String, required: true }, // vitals | metabolism | lifestyle | 生命体征 | 体重代谢 | 生活方式
  type:     { type: String, required: true }, // bloodPressure, bloodSugar, heartRate, weight, sleep, mood
  label:    { type: String, required: true },
  value:    { type: String, required: true },
  unit:     { type: String },
  extra:    { type: mongoose.Schema.Types.Mixed }, // { sys, dia } for BP; { mealType } for blood sugar; { imageUrl } for diet/exercise
  imageUrl: { type: String, default: '' },         // 打卡图片（base64 或 URL）
  status:   { type: String, enum: ['normal', 'warning', 'danger'], default: 'normal' },
  note:     { type: String, default: '' },
  recordedAt: { type: Date, default: Date.now },
  // 关联报告（如从报告中提取的指标数据，删除报告时级联删除）
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', default: null },
  // AI监测异常升级（试点：血压），danger级自动进入家庭医生待审核队列，处理后置为resolved
  aiAlertStatus: { type: String, enum: ['pending', 'resolved', null], default: null },
  // 医护端修正数据时留痕：谁在什么时候改的，原始值是多少（用户端自行编辑不记录，只留最新值）
  editedBy: {
    staffId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    staffName: { type: String, default: '' },
    editedAt:  { type: Date, default: null },
    prevValue: { type: String, default: '' },
  },
}, { timestamps: true });

// 索引：按用户+时间查询
healthRecordSchema.index({ user: 1, recordedAt: -1 });
healthRecordSchema.index({ user: 1, type: 1, recordedAt: -1 });

healthRecordSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('HealthRecord', healthRecordSchema);
