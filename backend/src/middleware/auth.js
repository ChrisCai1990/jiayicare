const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { tenantContext } = require('../utils/tenantScope');

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    // SSE 等场景支持 query string 传 token
    const token = (authHeader && authHeader.startsWith('Bearer '))
      ? authHeader.split(' ')[1]
      : req.query.token;
    if (!token) {
      return res.status(401).json({ success: false, message: '未登录，请先登录' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    req.user = user;
    tenantContext(req, res, next);
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token无效或已过期，请重新登录' });
  }
};
