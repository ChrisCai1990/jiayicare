const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  token: { type: String, required: true, select: false },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  tokenExpiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ staffId: 1, tenantId: 1, tokenExpiresAt: 1 });
module.exports = mongoose.model('StaffPushDevice', schema);
