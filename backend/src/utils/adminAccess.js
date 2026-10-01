// The platform operator may manage tenants and the shared AI budget only.
// Institution business routes must be accessed with an institution account.
function platformAdminMayAccess(path) {
  const pathname = String(path || '').split('?')[0];
  return pathname === '/api/admin/me/password'
    || /^\/api\/admin\/tenants(?:\/|$)/.test(pathname)
    || /^\/api\/admin\/ai-control(?:\/|$)/.test(pathname);
}

module.exports = { platformAdminMayAccess };
