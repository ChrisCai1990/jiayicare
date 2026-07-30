const mongoose = require('mongoose');

const memberTypeSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  clientBrand: {
    type: String,
    enum: ['jiayiguanjia', 'jinyisen'],
    default: 'jiayiguanjia',
    index: true,
  },
  parent:    { type: mongoose.Schema.Types.ObjectId, ref: 'MemberType', default: null },
  active:    { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

memberTypeSchema.index({ clientBrand: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('MemberType', memberTypeSchema);
