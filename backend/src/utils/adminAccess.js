// The platform operator may manage tenants and the shared AI budget only.
// Institution business routes must be accessed with an institution account.
function platformAdminMayAccess(path) {
  const pathname = String(path || '').split('?')[0];
  return pathname === '/api/admin/me/password'
    || /^\/api\/admin\/tenants(?:\/|$)/.test(pathname)
    || /^\/api\/admin\/ai-control(?:\/|$)/.test(pathname)
    || /^\/api\/admin\/agreements(?:\/|$)/.test(pathname)
    || /^\/api\/admin\/saas-plan(?:\/|$)/.test(pathname)
    || /^\/api\/admin\/clinical-standards(?:\/|$)/.test(pathname);
}

// Finance has an explicit read-only allowlist; new admin routes remain private.
function financeAdminMayAccess(path, method) {
  const pathname = String(path || '').split('?')[0];
  if (pathname === '/api/admin/me/password') return method === 'PUT';
  if (method !== 'GET') return false;
  return [
    '/api/admin/market-partners',
    '/api/admin/market-partners/business-overview',
    '/api/admin/market-partners/business-orders',
    '/api/admin/market-partners/team-revenue',
    '/api/admin/partner-teams/summary',
    '/api/admin/partner-teams/people-volume',
  ].includes(pathname) || /^\/api\/admin\/market-partners\/[0-9a-fA-F]{24}\/promotable-products$/.test(pathname)
    || /^\/api\/admin\/products\/[0-9a-fA-F]{24}\/cost-plan$/.test(pathname);
}

module.exports = { platformAdminMayAccess, financeAdminMayAccess };
