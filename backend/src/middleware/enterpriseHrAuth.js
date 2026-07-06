const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// 企业HR专用鉴权：在 adminAuth 基础上再校验角色为 enterprise_hr 且已绑定 enterpriseId
// 通过后 req.enterpriseId 为该HR归属的企业ID，供后续查询强制限定范围
module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: '未授权，请先登录' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'admin') {
      return res.status(403).json({ success: false, message: '无权限' });
    }
    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) return res.status(401).json({ success: false, message: '账号不存在' });
    if (admin.role !== 'enterprise_hr' || !admin.enterpriseId) {
      return res.status(403).json({ success: false, message: '非企业HR账号或未绑定企业' });
    }
    req.admin = admin;
    req.enterpriseId = admin.enterpriseId;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token 无效或已过期' });
  }
};
