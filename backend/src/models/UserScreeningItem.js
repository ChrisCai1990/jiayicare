const mongoose = require('mongoose');

const UserScreeningItemSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  itemId:      { type: String, required: true },  // e.g. 'tumor_lung|肺CT'
  category:    { type: String, required: true },  // 'tumor' | 'cardiovascular' | 'chronic' | 'health_promote'
  parentLabel: { type: String },                  // '肺癌'
  itemLabel:   { type: String, required: true },  // '肺CT'
  status:      { type: String, enum: ['pending', 'uploaded', 'completed'], default: 'pending' },
  reportId:    { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport' },
  note:        { type: String },
}, { timestamps: true });

UserScreeningItemSchema.index({ user: 1, itemId: 1 }, { unique: true });

module.exports = mongoose.model('UserScreeningItem', UserScreeningItemSchema);
