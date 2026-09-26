const Product = require('../models/Product');
const mongoose = require('mongoose');

function plain(value) {
  if (!value) return {};
  return value.toObject ? value.toObject() : value;
}

// 服务包只是权益模板；下单时必须冻结一份可履约的商城产品权益，避免运营后来
// 调整模板、商品名称或流程后，反向改变已售客户的权益。
async function buildPackageEntitlementSnapshot(servicePackage) {
  const servicePackageData = plain(servicePackage);
  const configuration = plain(servicePackageData.configuration);
  const configuredRows = Array.isArray(configuration.serviceEntitlements)
    ? configuration.serviceEntitlements
    : [];
  const rows = configuredRows
    .map(item => ({
      productId: String(item?.productId || ''),
      count: Math.max(0, Math.floor(Number(item?.count) || 0)),
      schedule: String(item?.schedule || '').trim(),
      poolKey: String(item?.poolKey || '').trim(),
    }))
    .filter(item => item.productId && mongoose.isValidObjectId(item.productId) && (item.count > 0 || item.poolKey));

  const sharedEntitlementPools = (Array.isArray(configuration.sharedEntitlementPools) ? configuration.sharedEntitlementPools : [])
    .map(pool => ({
      key: String(pool?.key || '').trim(),
      name: String(pool?.name || '').trim(),
      count: Math.max(1, Math.floor(Number(pool?.count) || 1)),
    }))
    .filter(pool => pool.key && pool.name);
  const poolsByKey = new Map(sharedEntitlementPools.map(pool => [pool.key, pool]));

  const ids = rows.map(item => item.productId);
  const products = ids.length ? await Product.find({ _id: { $in: ids } }).lean() : [];
  const byId = new Map(products.map(product => [String(product._id), product]));

  return {
    version: 1,
    packageId: servicePackageData._id || null,
    packageName: servicePackageData.name || '',
    clientBrand: servicePackageData.clientBrand || 'jiayiguanjia',
    deliveryMode: configuration.deliveryMode || 'digital',
    includes365: !!configuration.includes365,
    familySharing: !!configuration.familySharing,
    reviewMode: configuration.reviewMode || 'exception',
    noResponseRule: configuration.noResponseRule || '',
    sharedEntitlementPools: sharedEntitlementPools.map(pool => ({ ...pool, remainingCount: pool.count })),
    // 仅保留当前实际存在的商城商品；管理员配置的失效商品不会被写成可履约权益。
    productEntitlements: rows.flatMap(row => {
      const product = byId.get(row.productId);
      if (!product) return [];
      return [{
        productId: product._id,
        productName: product.name,
        count: poolsByKey.has(row.poolKey) ? 0 : row.count,
        remainingCount: poolsByKey.has(row.poolKey) ? 0 : row.count,
        poolKey: poolsByKey.has(row.poolKey) ? row.poolKey : '',
        schedule: row.schedule,
        productSnapshot: {
          category: product.category || '',
          fulfillmentType: product.fulfillmentType || 'offline_service',
          serviceWorkflow: product.serviceWorkflow || {},
          serviceItems: product.serviceItems || [],
        },
      }];
    }),
    capturedAt: new Date(),
  };
}

module.exports = { buildPackageEntitlementSnapshot };
