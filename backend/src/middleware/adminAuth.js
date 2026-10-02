const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Tenant = require('../models/Tenant');
const { tenantContext } = require('../utils/tenantScope');
const { platformAdminMayAccess } = require('../utils/adminAccess');
const { hasTenantChannel } = require('../utils/tenantChannel');

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: '未授权，请先登录' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'admin') {
      return res.status(403).json({ success: false, message: '无管理员权限' });
    }
    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) return res.status(401).json({ success: false, message: '管理员账号不存在' });
    if (admin.staffStatus === 'inactive') return res.status(403).json({ success: false, message: '账号已停用' });
    // 企业HR账号只能访问 /api/enterprise-hr 独立只读聚合接口，禁止访问超管/医护端全部接口
    if (admin.role === 'enterprise_hr') {
      return res.status(403).json({ success: false, message: '企业HR账号无权限访问该接口' });
    }
    if (admin.role !== 'platformSuper' && !admin.tenantId) {
      return res.status(403).json({ success: false, message: '管理员未归属机构' });
    }
    if (admin.tenantId) {
      const tenant = await Tenant.findById(admin.tenantId).select('status code serviceScope').lean();
      if (!tenant || tenant.status !== 'active') {
        return res.status(403).json({ success: false, message: '所属机构已停用或不存在' });
      }
      if (!hasTenantChannel(tenant, 'admin')) return res.status(403).json({ success: false, message: '本机构尚未开通管理后台' });
    }
    if (admin.role === 'platformSuper' && !platformAdminMayAccess(req.originalUrl)) {
      return res.status(403).json({ success: false, message: '平台管理员不能访问机构业务数据，请使用所属机构账号' });
    }
    if (admin.mustChangePassword && String(req.originalUrl).split('?')[0] !== '/api/admin/me/password') {
      return res.status(403).json({ success: false, message: '请先修改初始密码' });
    }
    req.admin = admin;
    tenantContext(req, res, next);
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token 无效或已过期' });
  }
};
