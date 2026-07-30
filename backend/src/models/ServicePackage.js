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
}, { timestamps: true });

servicePackageSchema.index({ clientBrand: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ServicePackage', servicePackageSchema);
