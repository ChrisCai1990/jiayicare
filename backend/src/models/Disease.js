const mongoose = require('mongoose');

const diseaseSchema = new mongoose.Schema({
  icdCode:  { type: String, default: '', trim: true },
  name:     { type: String, required: true, trim: true },
  category: { type: String, default: '' },
  remark:   { type: String, default: '' },
  status:   { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

diseaseSchema.index({ name: 'text', icdCode: 'text' });

module.exports = mongoose.model('Disease', diseaseSchema);
