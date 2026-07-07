const mongoose = require('mongoose');

const projectCategorySchema = new mongoose.Schema({
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键）
  name:      { type: String, required: true, trim: true },
  parent:    { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  sortOrder: { type: Number, default: 0 },
  status:    { type: String, enum: ['active', 'inactive'], default: 'active' },
  // AI报告解析自动归类用的同义词/别名（如"总胆固醇"节点可加"TC""CHOL"），叶子节点填写，非必填
  aliases:   { type: [String], default: [] },
}, { timestamps: true });

projectCategorySchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('ProjectCategory', projectCategorySchema);
