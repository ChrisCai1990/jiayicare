const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键）
  serviceId:    { type: String, required: true }, // 如 S1, S2（原为全局unique，多租户后改为 tenantId+serviceId 联合唯一，见下方索引）
  category:     { type: String, required: true },
  name:         { type: String, required: true },
  subtitle:     { type: String, default: '' },
  price:        { type: Number, required: true },
  originalPrice:{ type: Number, required: true },
  rating:       { type: Number, default: 4.8, min: 0, max: 5 },
  reviewCount:  { type: Number, default: 0 },
  tag:          { type: String, default: '' },
  tagColor:     { type: String, default: '' },
  icon:         { type: String, default: 'star-outline' },
  iconColor:    { type: String, default: '#1E6B50' },
  features:     [{ type: String }],
  images:       [{ type: String }],          // 图文图片 URL 列表
  description:  { type: String, default: '' }, // 富文本详情
  active:       { type: Boolean, default: true },
  sortOrder:    { type: Number, default: 0 },
  // 绩效分配规则（字段先占位，识别"谁是引流人/谁是服务人"的具体逻辑和自动分配触发链路待设计后再接入）
  performanceRule: require('../utils/tenantScope').performanceRuleSchema,
}, { timestamps: true });

// 原 serviceId 是全局 unique，现改为按机构联合唯一（tenantId 为 null 的存量数据仍保持全局互斥，避免落库前迁移期冲突）
serviceSchema.index({ tenantId: 1, serviceId: 1 }, { unique: true });

serviceSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('Service', serviceSchema);
