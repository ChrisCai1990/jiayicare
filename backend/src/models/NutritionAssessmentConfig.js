const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
  enabled: { type: Boolean, default: false },
  requestTitle: { type: String, default: '营养评估需求单', maxlength: 80 },
  requestInstructions: { type: String, default: '请说明评估原因及重点关注问题', maxlength: 1000 },
  bookingInstructions: { type: String, default: '与客户确认日期、具体时间及线上腾讯会议室或线下门店', maxlength: 1000 },
  assessmentInstructions: { type: String, default: '形成评估结论及后续建议', maxlength: 1000 },
  onlineEnabled: { type: Boolean, default: true },
  offlineEnabled: { type: Boolean, default: true },
}, { timestamps: true });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('NutritionAssessmentConfig', schema);
