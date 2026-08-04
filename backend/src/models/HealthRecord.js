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
  // 医疗数据采用可追溯软删除：正常查询自动排除，保留删除人、时间和原因供审计。
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  deletedByName: { type: String, default: '' },
  deleteReason: { type: String, default: '' },
  // 录入来源留痕。用户打卡为 customer；医护发现并代录为 staff。
  recordedBy: {
    source:    { type: String, enum: ['customer', 'staff', 'system'], default: 'customer' },
    staffId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    staffName: { type: String, default: '' },
    staffRole: { type: String, default: '' },
  },
  // “今日健康状态/不适主诉”处理闭环。仅 type=symptom 时使用。
  symptomWorkflow: {
    status: {
      type: String,
      enum: ['pending_manager', 'pending_doctor', 'manager_followup', 'referred', 'resolved', 'dismissed', null],
      default: null,
    },
    decisionNote: { type: String, default: '' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    decidedByName: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    verifiedByName: { type: String, default: '' },
    verifiedAt: { type: Date, default: null },
  },
  // 关联报告（如从报告中提取的指标数据，删除报告时级联删除）
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', default: null },
  // AI监测异常升级（试点：血压），danger级自动进入健康顾问待审核队列，处理后置为resolved
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

healthRecordSchema.pre(/^find/, function excludeSoftDeleted(next) {
  if (!Object.prototype.hasOwnProperty.call(this.getQuery(), 'deletedAt')) this.where({ deletedAt: null });
  next();
});
healthRecordSchema.pre('countDocuments', function excludeSoftDeletedFromCount(next) {
  if (!Object.prototype.hasOwnProperty.call(this.getQuery(), 'deletedAt')) this.where({ deletedAt: null });
  next();
});
healthRecordSchema.pre('aggregate', function excludeSoftDeletedFromAggregate(next) {
  this.pipeline().unshift({ $match: { deletedAt: null } });
  next();
});

healthRecordSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('HealthRecord', healthRecordSchema);
