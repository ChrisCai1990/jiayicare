const mongoose = require('mongoose');

// 员工团队：把若干医护人员编成一个团队，设一名导师(mentor)。导师除了自己名下的患者，
// 还能查看同团队其他成员名下的客户档案，用于带教/质量把控。
// 与 Department（科室，用于挂号）是两套独立概念——Team 是人员协作分组，不是挂号科室。
const teamSchema = new mongoose.Schema({
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  name:      { type: String, required: true, trim: true },
  mentorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 导师（可查看全团队客户档案）
  note:      { type: String, default: '' },
  status:    { type: String, enum: ['active', 'inactive'], default: 'active' },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

teamSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('Team', teamSchema);
