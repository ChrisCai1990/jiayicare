const { isReviewEnvironment } = require('../utils/reviewEnvironment');

module.exports = (req, res, next) => {
  if (!isReviewEnvironment()) return next();
  res.set('X-Jiayicare-Environment', 'isolated-review');
  const path = req.path.replace(/\/+$/, '');
  const normalLogin = path.startsWith('/api/auth/')
    && !(req.method === 'POST' && path === '/api/auth/review-account/demo')
    && !(req.method === 'GET' && path === '/api/auth/review-account/capabilities')
    && !['/api/auth/review-account/login', '/api/auth/session/activity'].includes(path);
  const externalOrPrivileged = /^\/api\/(admin|staff|integrations|enterprise-hr|ops-dashboard|visitor-assistant|partner-benefits|push-devices|payments)(\/|$)/.test(path);
  const purchase = req.method !== 'GET' && /^\/api\/(orders|services)(\/|$)/.test(path);
  if (normalLogin || externalOrPrivileged || purchase) {
    return res.status(403).json({ success: false, code: 'REVIEW_ENVIRONMENT_LIMIT', message: '当前为隔离测试环境，不执行真实登录、交易或外部通知' });
  }
  next();
};
