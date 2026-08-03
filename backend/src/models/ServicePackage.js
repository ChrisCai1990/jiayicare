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
}, { timestamps: true });

servicePackageSchema.index({ clientBrand: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ServicePackage', servicePackageSchema);
