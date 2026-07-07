const mongoose = require('mongoose');

// 机构/租户：多租户SaaS改造的顶层概念，一个Tenant代表一家独立运营的健康管理机构（如"嘉医汇"或引入的同行机构）
// 该机构下的员工(Admin)、患者(User)、体检报告等业务数据都通过 tenantId 关联到此
const tenantSchema = new mongoose.Schema({
  code:     { type: String, required: true, unique: true }, // 机构唯一标识（英文/拼音，如 jiayihui），用于登录域名/子域名映射
  name:     { type: String, required: true }, // 机构名称，如"嘉医汇"
  slogan:   { type: String, default: '' },     // 品牌标语，如"做家庭医师行业领跑者"
  logo:     { type: String, default: '' },     // logo图片URL
  themeColor: { type: String, default: '#1E6B50' }, // 主题色（默认沿用现有嘉医汇主色）
  status:   { type: String, enum: ['active', 'suspended'], default: 'active' },
  note:     { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Tenant', tenantSchema);
