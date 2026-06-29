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

// 允许同一筛查项多年数据并存：以 (user, itemId, reportId) 三元唯一
// 旧索引 { user, itemId } unique 需在 MongoDB 手动 drop 后此索引才生效
UserScreeningItemSchema.index({ user: 1, itemId: 1, reportId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('UserScreeningItem', UserScreeningItemSchema);
