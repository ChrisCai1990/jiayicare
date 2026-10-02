const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Tenant = require('../models/Tenant');
const { tenantContext } = require('../utils/tenantScope');
const { hasTenantChannel } = require('../utils/tenantChannel');

// 医护端角色列表
const STAFF_ROLES = [
  'superadmin',
  'familyDoctor', 'nutritionist', 'healthManager',
  'medicalAssistant', 'psychologist', 'rehabSpecialist',
  'tcmDoctor', 'specialist', 'healthPlanner',
];

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: '未授权，请先登录' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'admin') {
      return res.status(403).json({ success: false, message: '无医护端权限' });
    }
    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) return res.status(401).json({ success: false, message: '账号不存在' });
    if (admin.staffStatus === 'inactive') return res.status(403).json({ success: false, message: '账号已停用' });
    if (!STAFF_ROLES.includes(admin.role)) {
      return res.status(403).json({ success: false, message: '无医护端权限' });
    }
    if (!admin.tenantId) return res.status(403).json({ success: false, message: '员工未归属机构' });
    const tenant = await Tenant.findById(admin.tenantId).select('status code serviceScope').lean();
    if (!tenant || !['active', 'setup'].includes(tenant.status)) return res.status(403).json({ success: false, message: '所属机构已停用或不存在' });
    if (!hasTenantChannel(tenant, 'staff')) return res.status(403).json({ success: false, message: '本机构尚未开通医护端' });
    if (tenant.status === 'setup' && !/^\/api\/staff\/me(?:\/password)?$/.test(String(req.originalUrl).split('?')[0])) {
      return res.status(403).json({ success: false, message: '机构仍在配置阶段，客户业务尚未开放' });
    }
    const isPasswordChange = req.method === 'PUT' && req.path === '/me/password';
    if (admin.mustChangePassword && !isPasswordChange) {
      return res.status(403).json({ success: false, message: '请先修改初始密码' });
    }
    req.staff = admin;
    tenantContext(req, res, next);
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token 无效或已过期' });
  }
};
