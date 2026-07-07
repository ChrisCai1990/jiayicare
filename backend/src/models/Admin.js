const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name:     { type: String, required: true },
  // 原管理员角色保留；新增医护端一线角色
  role: {
    type: String,
    enum: [
      'superadmin',      // 超级管理员
      'doctor', 'manager', // 旧管理员角色（兼容）
      'familyDoctor',    // 家庭医师
      'nutritionist',    // 营养师
      'healthManager',   // 健管专员
      'medicalAssistant',// 就医专员
      'psychologist',    // 心理咨询师
      'rehabSpecialist', // 运动复健师
      'tcmDoctor',       // 中医师
      'specialist',      // 专科医师
      'healthPlanner',   // 健康规划师
      'enterprise_hr',   // 企业客户HR/行政对接人，仅可查看本企业员工聚合数据
    ],
    default: 'healthManager',
  },
  title:      { type: String, default: '' },
  avatar:     { type: String, default: '' },
  // 医护端扩展字段
  department: { type: String, default: '' },  // 所属部门（旧字符串，保留兼容）
  managerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  region:     { type: String, default: '' },
  enterpriseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enterprise', default: null }, // role=enterprise_hr 时归属的企业
  tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键，superadmin 也归属具体机构，只管理本机构）
  // 新增字段
  phone:        { type: String, default: '' },  // 手机号（唯一识别码）
  email:        { type: String, default: '' },
  certNumber:   { type: String, default: '' }, // 证书编号（如医师执业证号）
  staffStatus:  { type: String, enum: ['active', 'inactive'], default: 'active' },
  deptId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  customRoleId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffRole', default: null },
}, { timestamps: true });

// 密码哈希
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

adminSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

adminSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('Admin', adminSchema);
