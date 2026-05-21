const mongoose = require('mongoose');
const { Schema } = mongoose;

const giftRecordSchema = new Schema({
  staffId:      { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  patientId:    { type: Schema.Types.ObjectId, ref: 'User',  required: true },
  giftType:     { type: String, enum: ['service', 'fund'], required: true },
  // 赠送服务
  serviceName:  { type: String, default: '' },
  serviceCount: { type: Number, default: 0 },
  // 赠送健康基金
  fundAmount:   { type: Number, default: 0 },   // 元
  fundType:     { type: String, enum: ['enterprise', 'promotion', 'other'], default: 'enterprise' },
  // 通用
  validFrom:    { type: Date, default: null },
  validTo:      { type: Date, default: null },
  remark:       { type: String, default: '' },
  status:       { type: String, enum: ['active', 'used', 'expired'], default: 'active' },
}, { timestamps: true });

giftRecordSchema.index({ patientId: 1 });
giftRecordSchema.index({ staffId: 1 });

module.exports = mongoose.model('GiftRecord', giftRecordSchema);
