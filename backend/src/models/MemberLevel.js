const mongoose = require('mongoose');

const memberLevelSchema = new mongoose.Schema({
  name:       { type: String, required: true },           // 等级名称，如"黄金会员"
  minPoints:  { type: Number, default: 0 },               // 升级所需最低积分
  color:      { type: String, default: '#8AA89C' },       // 显示颜色
  benefits:   { type: [String], default: [] },            // 权益描述列表
  isActive:   { type: Boolean, default: true },
  sortOrder:  { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('MemberLevel', memberLevelSchema);
