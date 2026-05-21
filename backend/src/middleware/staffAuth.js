const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

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
    if (!STAFF_ROLES.includes(admin.role)) {
      return res.status(403).json({ success: false, message: '无医护端权限' });
    }
    req.staff = admin;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token 无效或已过期' });
  }
};
