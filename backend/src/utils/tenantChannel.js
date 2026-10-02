function hasTenantChannel(tenant, channel) {
  if (!tenant) return false;
  // 嘉医汇是存量机构，历史协议未使用 serviceScope 表示开通状态。
  if (tenant.code === 'jiayihui') return true;
  return Array.isArray(tenant.serviceScope) && tenant.serviceScope.includes(channel);
}

module.exports = { hasTenantChannel };
