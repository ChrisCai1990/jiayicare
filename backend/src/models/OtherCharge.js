const mongoose = require('mongoose');

// 其他收费（如"挂号费""材料费"）
const otherChargeSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  mnemonic:    { type: String, default: '', trim: true },
  costPrice:   { type: Number, default: 0 },
  retailPrice: { type: Number, default: 0 },
  unit:        { type: String, default: '次' },
  categoryId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('OtherCharge', otherChargeSchema);
