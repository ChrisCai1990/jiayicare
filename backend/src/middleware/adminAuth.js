const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const { tenantContext } = require('../utils/tenantScope');

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
    // 企业HR账号只能访问 /api/enterprise-hr 独立只读聚合接口，禁止访问超管/医护端全部接口
    if (admin.role === 'enterprise_hr') {
      return res.status(403).json({ success: false, message: '企业HR账号无权限访问该接口' });
    }
    req.admin = admin;
    tenantContext(req, res, next);
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token 无效或已过期' });
  }
};
