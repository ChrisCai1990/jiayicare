const jwt = require('jsonwebtoken');
const User = require('../models/User');
const LoginSession = require('../models/LoginSession');
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
    req.authSessionId = decoded.sessionId || '';

    if (decoded.sessionId) {
      const activeSession = await LoginSession.exists({ sessionId: decoded.sessionId, logoutAt: null });
      if (!activeSession) return res.status(401).json({ success: false, message: '登录已退出，请重新登录' });
      // 旧版30天令牌首次正常请求时升级为持久、服务端可撤销的会话。
      if (!decoded.persistent) {
        const persistentToken = jwt.sign(
          { id: decoded.id, sessionId: decoded.sessionId, persistent: true },
          process.env.JWT_SECRET,
          { expiresIn: '10y' },
        );
        res.set('X-Auth-Token', persistentToken);
      }
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user || user.isDeleted) {
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    req.user = user;
    tenantContext(req, res, next);
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token无效或已过期，请重新登录' });
  }
};
