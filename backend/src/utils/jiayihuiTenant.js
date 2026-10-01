const Tenant = require('../models/Tenant');

async function jiayihuiTenantId() {
  const tenant = await Tenant.findOneAndUpdate(
    { code: 'jiayihui' },
    { $setOnInsert: { name: '嘉医汇', status: 'active' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (tenant.status !== 'active') throw new Error('嘉医汇机构已停用');
  return tenant._id;
}

module.exports = { jiayihuiTenantId };
