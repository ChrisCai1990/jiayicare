const mongoose = require('mongoose');

// 单例文档：全库只有一条记录
const companyInfoSchema = new mongoose.Schema({
  name:         { type: String, default: '' },
  creditCode:   { type: String, default: '' },
  logo:         { type: String, default: '' }, // base64 或 URL
  slogan:       { type: String, default: '' },
  tagline:      { type: String, default: '' },
  phone:        { type: String, default: '' },
  address:      { type: String, default: '' },
  customFields: [{ key: String, value: String }],
}, { timestamps: true });

module.exports = mongoose.model('CompanyInfo', companyInfoSchema);
