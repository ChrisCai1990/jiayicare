const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

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
    req.admin = admin;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token 无效或已过期' });
  }
};
