// 服务到期锁定：serviceExpiry 是字符串日期（如 '2026-12-31'），非 Date 类型。
// 空值暂不视为到期（避免误伤 serviceExpiry 从未被写入过的存量老客户，待确认存量占比后可收紧为严格模式）。
//
// 用法：全局挂载在用户端专属路由前（user/records/medications/...），默认锁定所有请求；
// 白名单里的"方法+路径前缀"组合豁免放行（健康档案查看类只读接口、服务商城/下单/续费入口）。
// 采用"默认锁+白名单放行"而非逐接口手动加锁，是为了避免新增接口漏挂导致锁形同虚设——
// 新增的用户端写操作接口默认就是锁定状态，需要显式放行的才加进白名单。
function isServiceExpired(user) {
  if (!user.serviceExpiry) return false;
  const expiry = new Date(user.serviceExpiry);
  if (Number.isNaN(expiry.getTime())) return false;
  expiry.setHours(23, 59, 59, 999); // 到期当天仍可用，次日零点后判定过期
  return expiry.getTime() < Date.now();
}

// { method, prefix } — prefix 匹配 req.originalUrl 以 /api 开头的路径前缀（含method匹配）
const WHITELIST = [
  // 健康档案查看（只读）
  { method: 'GET', prefix: '/api/user/me' },
  { method: 'GET', prefix: '/api/user/dashboard' },
  { method: 'GET', prefix: '/api/user/report' },
  { method: 'GET', prefix: '/api/records' },
  { method: 'GET', prefix: '/api/reports' },
  { method: 'GET', prefix: '/api/screening' },
  // 服务商城 + 下单 + 续费（到期后仍需能购买/续费，否则无法自救）
  { method: 'ALL', prefix: '/api/services' },
  { method: 'ALL', prefix: '/api/orders' },
  { method: 'GET', prefix: '/api/user/points' },
  { method: 'GET', prefix: '/api/user/gifts' },
  // 登录态本身、消息未读数等基础可用性不受影响
  { method: 'GET', prefix: '/api/messages/unread-count' },
];

function isWhitelisted(req) {
  const url = req.originalUrl.split('?')[0];
  return WHITELIST.some(w => (w.method === 'ALL' || w.method === req.method) && url.startsWith(w.prefix));
}

function checkServiceActive(req, res, next) {
  if (isWhitelisted(req)) return next();
  if (isServiceExpired(req.user)) {
    return res.status(403).json({
      success: false,
      code: 'SERVICE_EXPIRED',
      message: '您的服务已到期，该功能已锁定。如需继续使用请联系健康管理师续费。',
    });
  }
  next();
}

module.exports = { checkServiceActive, isServiceExpired };
