const mongoose = require('mongoose');
const crypto = require('crypto');

// 单例文档：对外运营展示看板的访问配置（长随机链接slug + 简单口令，非账号登录二次防护）
const opsDashboardConfigSchema = new mongoose.Schema({
  slug:     { type: String, default: () => crypto.randomBytes(16).toString('hex') }, // 展示链接里的随机路径段
  passcode: { type: String, default: '' }, // 展示口令，明文存储即可（非账号密码，仅防随手翻看）
  enabled:  { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('OpsDashboardConfig', opsDashboardConfigSchema);
