const mongoose = require('mongoose');

const servicePackageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  clientBrand: {
    type: String,
    enum: ['jiayiguanjia', 'jinyisen'],
    required: true,
    index: true,
  },
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  entitlements: {
    aiHealthAnalysis: { type: Boolean, default: false },
    aiRiskAssessment: { type: Boolean, default: false },
    phaseAssessment: { type: Boolean, default: false },
    monthlyServiceReview: { type: Boolean, default: false },
    healthConsultation: { type: Boolean, default: false },
    medicalPlanning: { type: Boolean, default: false },
    expertAppointment: { type: Boolean, default: false },
    reportInterpretation: { type: Boolean, default: false },
  },
  activation: {
    enabled: { type: Boolean, default: false },
    durationMonths: { type: Number, min: 1, default: 12 },
    price: { type: Number, min: 0, default: 0 },
    originalPrice: { type: Number, min: 0, default: 0 },
    features: [{ type: String, trim: true }],
    tag: { type: String, trim: true, default: '' },
    highlight: { type: Boolean, default: false },
  },
  // 后台配置的交付与权益模板。保留 Mixed，使运营可逐步扩展服务、次数和周期，
  // 已售方案应另存快照，不能因调整此模板而改变历史客户权益。
  configuration: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

servicePackageSchema.index({ clientBrand: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ServicePackage', servicePackageSchema);
