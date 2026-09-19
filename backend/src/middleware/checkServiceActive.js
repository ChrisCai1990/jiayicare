// 服务到期锁定：可信续约凭据优先；尚未进入新凭据周期的历史客户兼容 serviceExpiry。
// 空值暂不视为到期（避免误伤 serviceExpiry 从未被写入过的存量老客户，待确认存量占比后可收紧为严格模式）。
//
// 用法：全局挂载在用户端专属路由前（user/records/medications/...），默认锁定所有请求；
// 白名单里的"方法+路径前缀"组合豁免放行（健康档案查看类只读接口、服务商城/下单/续费入口）。
// 采用"默认锁+白名单放行"而非逐接口手动加锁，是为了避免新增接口漏挂导致锁形同虚设——
// 新增的用户端写操作接口默认就是锁定状态，需要显式放行的才加进白名单。
function isServiceExpired(user) {
  return !require('../utils/serviceAccess').legacyAccess(user).active;
}

// { method, prefix } — prefix 匹配 req.originalUrl 以 /api 开头的路径前缀（含method匹配）
const WHITELIST = [
  // 首次建档是进入系统前的基础身份步骤，不能被服务到期锁住，否则会形成无法完成建档的死循环。
  { method: 'POST', prefix: '/api/user/onboarding' },
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
  // 到期后仍可查看本人已发布方案并确认；派发门槛在确认接口内另行校验。
  if (req.method === 'GET' && /^\/api\/user\/annual-mgmt-plans\/?$/.test(url)) return true;
  if (req.method === 'PATCH' && /^\/api\/user\/annual-mgmt-plans\/[a-f\d]{24}\/confirm\/?$/i.test(url)) return true;
  return WHITELIST.some(w => (w.method === 'ALL' || w.method === req.method) && url.startsWith(w.prefix));
}

async function checkServiceActive(req, res, next) {
  if (isWhitelisted(req)) return next();
  try {
    const access = await require('../utils/serviceAccess').resolveServiceAccess(req.user);
    req.serviceAccess = access;
    if (access.active) return next();
    return res.status(403).json({
      success: false,
      code: 'SERVICE_EXPIRED',
      message: `${access.reason}，该功能暂不可用。如有疑问请联系健康规划师核对。`,
    });
  } catch (error) {
    // 数据库不可用时不能退回旧日期误放行；保留可重试而非误报到期。
    return res.status(503).json({ success: false, code: 'SERVICE_ACCESS_UNAVAILABLE', message: '暂时无法核验服务状态，请稍后重试' });
  }
}

module.exports = { checkServiceActive, isServiceExpired };
