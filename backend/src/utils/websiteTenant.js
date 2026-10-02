const Tenant = require('../models/Tenant');

class WebsiteTenantError extends Error {
  constructor(message) { super(message); this.status = 403; }
}

function normalizeWebsiteHost(value) {
  if (typeof value !== 'string') throw new Error('网站域名格式无效');
  const input = value.trim().toLowerCase();
  if (!input || input.includes('*') || input.includes('\\')) throw new Error('请输入明确的网站域名');
  let url;
  try { url = new URL(input.includes('://') ? input : `https://${input}`); }
  catch { throw new Error('网站域名格式无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('网站域名不能包含路径、账号或参数');
  const host = url.host.toLowerCase();
  if (!/^(?:[a-z0-9-]+\.)+[a-z0-9-]{2,63}(?::\d{1,5})?$/.test(host) && !/^localhost:\d{2,5}$/.test(host)) throw new Error('网站域名格式无效');
  if (url.protocol !== 'https:' && !host.startsWith('localhost:')) throw new Error('网站必须使用 HTTPS');
  return host;
}

function normalizeWebsiteHosts(value) {
  if (!Array.isArray(value) || value.length > 20) throw new Error('网站域名须为不超过20项的列表');
  return [...new Set(value.map(normalizeWebsiteHost))];
}

async function resolveWebsiteTenant(req) {
  let host;
  try {
    const origin = req.get('origin');
    const requestHost = normalizeWebsiteHost(req.get('host'));
    const originHost = origin ? normalizeWebsiteHost(origin) : requestHost;
    if (originHost !== requestHost) throw new Error('网站来源与访问域名不一致');
    host = originHost;
  } catch {
    throw new WebsiteTenantError('网站来源无法核验，请检查网站接入配置');
  }
  const matches = await Tenant.find({ websiteHosts: host, status: 'active' }).select('_id name').limit(2).lean();
  if (matches.length !== 1) throw new WebsiteTenantError('网站尚未绑定有效机构，请联系平台管理员');
  return { tenantId: matches[0]._id, siteHost: host, tenantName: String(matches[0].name || '本机构').slice(0, 50) };
}

async function websiteOriginAllowed(origin) {
  try { return !!(await Tenant.exists({ websiteHosts: normalizeWebsiteHost(origin), status: 'active' })); }
  catch { return false; }
}

module.exports = { WebsiteTenantError, normalizeWebsiteHost, normalizeWebsiteHosts, resolveWebsiteTenant, websiteOriginAllowed };
