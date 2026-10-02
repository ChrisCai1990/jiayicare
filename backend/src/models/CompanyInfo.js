const mongoose = require('mongoose');

// 每家机构各有一条企业信息；存量嘉医汇记录在迁移后标记机构归属。
const companyInfoSchema = new mongoose.Schema({
  tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  name:         { type: String, default: '' },
  creditCode:   { type: String, default: '' },
  logo:         { type: String, default: '' }, // base64 或 URL
  slogan:       { type: String, default: '' },
  tagline:      { type: String, default: '' },
  phone:        { type: String, default: '' },
  address:      { type: String, default: '' },
  customFields: [{ key: String, value: String }],
}, { timestamps: true });

companyInfoSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);
companyInfoSchema.index({ tenantId: 1 }, { unique: true });

module.exports = mongoose.model('CompanyInfo', companyInfoSchema);
