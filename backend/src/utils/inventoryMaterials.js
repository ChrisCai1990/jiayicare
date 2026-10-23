const Product = require('../models/Product');
const Material = require('../models/InventoryMaterial');

// Preserve the old ledger key and balance once. Repeated calls never overwrite
// a physical balance, name or service mapping maintained in the new ledger.
async function ensureLegacyMaterial(product) {
  if (!product?.inventoryTracking?.enabled || !product.tenantId) return;
  const tracking = product.inventoryTracking.toObject?.() || product.inventoryTracking;
  try { await Material.updateOne({ _id: product._id, tenantId: product.tenantId }, { $setOnInsert: {
    tenantId: product.tenantId, name: product.name, stock: Number(product.stock || 0),
    linkedProductIds: [product._id], legacyProductId: product._id, inventoryTracking: tracking,
  } }, { upsert: true }); } catch (error) {
    if (error.code !== 11000 || !await Material.exists({ _id: product._id, tenantId: product.tenantId })) throw error;
  }
}
async function ensureLegacyMaterials(tenantId) {
  const products = await Product.find({ tenantId, 'inventoryTracking.enabled': true }).select('tenantId name stock inventoryTracking').lean();
  for (const product of products) await ensureLegacyMaterial(product);
}
async function usesPhysicalMaterials(product) {
  if (product?.inventoryTracking?.enabled) { await ensureLegacyMaterial(product); return true; }
  return !!(product?._id && await Material.exists({ tenantId: product.tenantId || null, linkedProductIds: product._id }));
}
module.exports = { ensureLegacyMaterial, ensureLegacyMaterials, usesPhysicalMaterials };
