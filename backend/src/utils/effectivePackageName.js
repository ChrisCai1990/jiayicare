// 旧个人护航客户仍保存上线前的名称；企业护航必须通过企业归属和独立套餐授予。
function effectivePackageName(user) {
  const name = String(user?.servicePackage || '').trim();
  if (name === '健康护航计划' && (user?.clientBrand || 'jiayiguanjia') === 'jiayiguanjia'
    && !user?.enterpriseId && user?.membershipTier !== 'enterprise') return '个人健康护航计划';
  return name;
}

module.exports = { effectivePackageName };
