const mongoose = require('mongoose');

// 合作伙伴（口腔诊所、体检机构、保险公司、酒店等），权益挂在其名下（见 PartnerBenefit.js）
const partnerSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  category:    { type: String, required: true }, // 如：口腔、体检、保险、酒店
  logo:        { type: String, default: '' },
  description: { type: String, default: '' },
  contactPhone:{ type: String, default: '' },
  status:      { type: String, enum: ['on', 'off'], default: 'on' },
  sortOrder:   { type: Number, default: 999 },
  // 预留合作伙伴自助登录（暂不启用，先由admin代管）
  loginAccount:  { type: String, default: '', sparse: true },
  loginPassword: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Partner', partnerSchema);
