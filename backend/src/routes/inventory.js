const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Material = require('../models/InventoryMaterial');
const { ensureLegacyMaterials } = require('../utils/inventoryMaterials');
const Order = require('../models/Order');
const User = require('../models/User');
const InventoryEntry = require('../models/InventoryEntry');
const Admin = require('../models/Admin');
const adminAuth = require('../middleware/adminAuth');
const staffAuth = require('../middleware/staffAuth');

const adminRouter = express.Router();
const staffRouter = express.Router();
adminRouter.use(adminAuth);
staffRouter.use(staffAuth);

function tenant(req) { return req.admin?.tenantId || req.staff?.tenantId; }
function actor(req) { return req.admin || req.staff; }
function bad(res, message, status = 400) { return res.status(status).json({ success: false, message }); }
function validId(value) { return mongoose.isValidObjectId(value); }
function productFilter(req) { return { tenantId: tenant(req), 'inventoryTracking.enabled': true }; }
async function prepareMaterials(req, res, next) { await ensureLegacyMaterials(tenant(req)); next(); }
adminRouter.use(prepareMaterials);
staffRouter.use(prepareMaterials);
async function validLinks(ids, req) {
  return Array.isArray(ids) && ids.every(validId) && new Set(ids.map(String)).size === ids.length && await Product.countDocuments({ tenantId: tenant(req), _id: { $in: ids } }) === ids.length;
}

async function list(req, res) {
  const products = await Material.find(productFilter(req)).sort({ name: 1 }).lean();
  const linked = await Product.find({ tenantId: tenant(req), _id: { $in: products.flatMap(p => p.linkedProductIds) } }).select('name originalPrice').lean();
  products.forEach(p => { p.linkedProducts = linked.filter(x => p.linkedProductIds.some(id => String(id) === String(x._id))); });
  const ids = products.map(p => p._id);
  const receipts = ids.length ? await InventoryEntry.find({ tenantId: tenant(req), productId: { $in: ids }, type: 'receipt' }).select('productId batchNo expiresAt createdAt').sort({ expiresAt: 1, createdAt: -1 }).lean() : [];
  products.forEach(product => { product.receiptBatches = receipts.filter(row => String(row.productId) === String(product._id)); });
  const legacyOpenings = ids.length ? await InventoryEntry.find({ tenantId: tenant(req), productId: { $in: ids }, type: 'opening', note: '启用台账时的期初库存；请与实物核对' }).select('productId createdAt').lean() : [];
  const legacyByProduct = new Map(legacyOpenings.map(row => [String(row.productId), row.createdAt]));
  const counts = legacyOpenings.length ? await InventoryEntry.find({ tenantId: tenant(req), productId: { $in: legacyOpenings.map(row => row.productId) }, type: 'count' }).select('productId createdAt').lean() : [];
  const countedProducts = new Set(counts.filter(row => row.createdAt >= legacyByProduct.get(String(row.productId))).map(row => String(row.productId)));
  products.forEach(product => { product.needsOpeningCount = legacyByProduct.has(String(product._id)) && !countedProducts.has(String(product._id)); });
  const recent = ids.length ? await InventoryEntry.find({ tenantId: tenant(req), productId: { $in: ids } })
    .sort({ createdAt: -1 }).limit(100).populate('userId', 'name patientNo').populate('actorId', 'name').populate('serviceProductId', 'name').lean() : [];
  res.json({ success: true, data: { products, recent } });
}
adminRouter.get('/', list);
staffRouter.get('/', list);

async function people(req, res) {
  const staff = await Admin.find({ tenantId: tenant(req), staffStatus: { $ne: 'inactive' } }).select('name role').sort({ name: 1 }).lean();
  res.json({ success: true, data: staff });
}
adminRouter.get('/people', people);
staffRouter.get('/people', people);

async function users(req, res) {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.json({ success: true, data: [] });
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const list = await User.find({ tenantId: tenant(req), $or: [{ name: new RegExp(escaped, 'i') }, { phone: new RegExp(escaped) }] }).select('name phone patientNo').limit(20).lean();
  res.json({ success: true, data: list });
}
adminRouter.get('/users', users);
staffRouter.get('/users', users);

adminRouter.post('/products/:id/enable', (req, res) => bad(res, '请刷新页面，通过新建实物物资建立独立库存', 409));
adminRouter.post('/materials', async (req, res) => {
  const { name, linkedProductIds = [], kind = 'consumable', unit = '件', minStock = 0, defaultCost = 0, location = '', openingQuantity, openingNote = '' } = req.body || {};
  if (!String(name || '').trim() || !['consumable', 'reusable'].includes(kind) || !Number.isInteger(Number(minStock)) || Number(minStock) < 0 || !Number.isFinite(Number(defaultCost)) || Number(defaultCost) < 0) return bad(res, '请填写物资名称及有效参数');
  if (openingQuantity === undefined || openingQuantity === null || String(openingQuantity).trim() === '' || !Number.isInteger(Number(openingQuantity)) || Number(openingQuantity) < 0 || !String(openingNote).trim()) return bad(res, '请填写实盘期初数量和清点依据');
  if (!await validLinks(linkedProductIds, req)) return bad(res, '关联服务必须属于本机构，且不能重复');
  const product = await Material.create({ tenantId: tenant(req), name: String(name).trim().slice(0, 120), stock: Number(openingQuantity), linkedProductIds,
    inventoryTracking: { enabled: true, kind, unit: String(unit).trim().slice(0, 20) || '件', minStock: Number(minStock), defaultCost: Number(defaultCost), location: String(location).trim().slice(0, 80) } });
  try {
    await InventoryEntry.create({ tenantId: tenant(req), productId: product._id, materialId: product._id, type: 'opening', quantity: product.stock, units: product.stock, balanceAfter: product.stock, unitCost: Number(defaultCost), actorId: actor(req)._id, note: `独立物资实盘期初：${String(openingNote).trim()}`.slice(0, 500) });
  } catch (error) { await Material.deleteOne({ _id: product._id, tenantId: tenant(req) }); throw error; }
  res.json({ success: true, data: product });
});

adminRouter.patch('/products/:id/settings', async (req, res) => {
  if (!validId(req.params.id)) return bad(res, '商品编号无效');
  const product = await Material.findOne({ ...productFilter(req), _id: req.params.id });
  if (!product) return bad(res, '物资不存在', 404);
  const { minStock, defaultCost, location, name, linkedProductIds } = req.body || {};
  if (name !== undefined) { if (!String(name).trim()) return bad(res, '请填写物资名称'); product.name = String(name).trim().slice(0, 120); }
  if (linkedProductIds !== undefined) { if (!await validLinks(linkedProductIds, req)) return bad(res, '关联服务必须属于本机构，且不能重复'); product.linkedProductIds = linkedProductIds; }
  if (minStock !== undefined) {
    if (!Number.isInteger(Number(minStock)) || Number(minStock) < 0) return bad(res, '最低库存无效');
    product.inventoryTracking.minStock = Number(minStock);
  }
  if (defaultCost !== undefined) {
    if (!Number.isFinite(Number(defaultCost)) || Number(defaultCost) < 0) return bad(res, '参考成本无效');
    product.inventoryTracking.defaultCost = Number(defaultCost);
  }
  if (location !== undefined) product.inventoryTracking.location = String(location).trim().slice(0, 80);
  await product.save();
  res.json({ success: true, data: product });
});

async function addEntry(req, res) {
  const { productId, type, units, sourceReceiptId, batchNo = '', serialNo = '', expiresAt, location = '', userId, assigneeId, fromIssued = false, orderId, unitCost, unitPrice, serviceProductId, requestId, note = '' } = req.body || {};
  if (!validId(productId)) return bad(res, '请选择物资');
  if (!['receipt', 'issue', 'use', 'return', 'loss', 'manual_sale'].includes(type)) return bad(res, '流水类型无效');
  if (req.staff && !['issue', 'use', 'return', 'manual_sale'].includes(type)) return bad(res, '该操作需在管理后台办理', 403);
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId || '')) return bad(res, '请刷新页面后登记流水');
  const existing = await InventoryEntry.findOne({ tenantId: tenant(req), requestId });
  if (existing) {
    if (String(existing.actorId) === String(actor(req)._id) && String(existing.productId) === String(productId) && existing.type === type && existing.units === Number(units)) return res.json({ success: true, data: existing, repeated: true });
    return bad(res, '该请求已保存其他流水，请刷新后重试', 409);
  }
  const amount = Number(units);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000) return bad(res, '数量须为正整数');
  if ((type === 'use' || type === 'manual_sale') && !validId(userId)) return bad(res, '请关联实际使用或购买的客户');
  if (['issue', 'return'].includes(type) && !validId(assigneeId)) return bad(res, '请指定领用或归还人员');
  if (fromIssued && type !== 'use') return bad(res, '只有实际使用可关联已领用物资');
  if (fromIssued && !validId(assigneeId)) return bad(res, '请指定此前领用人员');
  if (orderId && (type !== 'use' || !validId(orderId))) return bad(res, '商城订单只能作为实际发放或使用的消费来源');
  if (type === 'manual_sale' && fromIssued) return bad(res, '手工销售不能重复使用已领用记录');
  if (type === 'manual_sale' && !String(note).trim()) return bad(res, '请填写消费或收款凭据');
  const product = await Material.findOne({ ...productFilter(req), _id: productId });
  if (!product) return bad(res, '物资不存在', 404);
  if (product.inventoryTracking.kind === 'reusable' && type !== 'manual_sale' && (amount !== 1 || !String(serialNo).trim())) return bad(res, '可重复使用设备须逐台登记序列号');
  if (product.inventoryTracking.kind === 'reusable' && type === 'use' && !fromIssued && !orderId) return bad(res, '设备使用请关联领用人或已购买订单');
  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) return bad(res, '有效期无效');
  let resolvedBatch = String(batchNo).trim();
  let resolvedExpiry = expiresAt || null;
  if (sourceReceiptId) {
    if (!validId(sourceReceiptId) || !['issue', 'use', 'return', 'loss'].includes(type)) return bad(res, '请选择有效的入库批次');
    const receipt = await InventoryEntry.findOne({ _id: sourceReceiptId, tenantId: tenant(req), productId, type: 'receipt' });
    if (!receipt) return bad(res, '入库批次不存在或不属于该物资', 404);
    resolvedBatch = receipt.batchNo || '';
    resolvedExpiry = receipt.expiresAt || null;
  }
  if (['issue', 'use'].includes(type) && resolvedExpiry && new Date(resolvedExpiry).toISOString().slice(0,10) < new Date().toLocaleDateString('en-CA', { timeZone:'Asia/Shanghai' })) return bad(res, '该批次已过有效期，不能领用或发放');
  let service = null;
  if (serviceProductId) {
    if (!validId(serviceProductId) || !product.linkedProductIds.some(id => String(id) === String(serviceProductId))) return bad(res, '请选择该物资关联的服务');
    service = await Product.findOne({ _id: serviceProductId, tenantId: tenant(req) });
    if (!service) return bad(res, '关联服务不存在');
  }
  if (type === 'manual_sale' && !service) return bad(res, '录入消费时请选择关联服务');
  if (type === 'manual_sale' && req.staff && Number(unitPrice) !== Number(service.originalPrice)) return bad(res, '成交价须使用所选服务的后台售价', 403);
  if (userId && !await User.exists({ _id: userId, tenantId: tenant(req) })) return bad(res, '客户不存在', 404);
  if (orderId) {
    const paidOrder = await Order.findOne({ _id: orderId, tenantId: tenant(req), user: userId, paymentStatus: 'paid', tradeStatus: { $nin: ['closed', 'refunded'] } });
    if (!paidOrder || !product.linkedProductIds.some(id => String(id) === String(paidOrder.serviceId))) return bad(res, '请选择该客户购买的关联服务订单');
    if (service && String(service._id) !== String(paidOrder.serviceId)) return bad(res, '订单与所选服务不一致');
    service = await Product.findOne({ _id: paidOrder.serviceId, tenantId: tenant(req) });
    if (!service) return bad(res, '订单对应服务不存在');
  }
  if (assigneeId && !await require('../models/Admin').exists({ _id: assigneeId, tenantId: tenant(req), staffStatus: { $ne: 'inactive' } })) return bad(res, '领用人员不存在', 404);
  if (fromIssued || type === 'return') {
    const ledger = await InventoryEntry.find({ tenantId: tenant(req), productId, assigneeId,
      ...(product.inventoryTracking.kind === 'reusable' ? { serialNo: String(serialNo).trim() } : {}),
      type: { $in: ['issue', 'use', 'return'] } }).select('type units fromIssued').lean();
    const remaining = ledger.reduce((sum, row) => sum + (row.type === 'issue' ? row.units : row.type === 'return' || (row.fromIssued && product.inventoryTracking.kind !== 'reusable') ? -row.units : 0), 0);
    if (remaining < amount) return bad(res, '该人员已领用的未使用数量不足', 409);
  }
  if (type === 'manual_sale' && (!Number.isFinite(Number(unitPrice)) || Number(unitPrice) < 0)) return bad(res, '请输入本次成交单价');
  if (unitCost !== undefined && unitCost !== '' && (!Number.isFinite(Number(unitCost)) || Number(unitCost) < 0)) return bad(res, '成本单价无效');
  let delta = ['receipt', 'return'].includes(type) ? amount : -amount;
  if ((type === 'use' && fromIssued) || type === 'manual_sale') delta = 0;
  const updated = await Material.findOneAndUpdate(
    { ...productFilter(req), _id: productId, ...(delta < 0 ? { stock: { $gte: -delta } } : {}) },
    { $inc: { stock: delta } }, { new: true },
  );
  if (!updated) return bad(res, '可用库存不足或物资状态已变化', 409);
  try {
    const entry = await InventoryEntry.create({ tenantId: tenant(req), productId, materialId: productId, serviceProductId: service?._id || null, requestId, type, quantity: delta, units: amount, fromIssued: !!fromIssued, sourceOrderId: orderId || null, balanceAfter: Number(updated.stock), sourceReceiptId: sourceReceiptId || null, batchNo: resolvedBatch.slice(0, 80), serialNo: String(serialNo).trim().slice(0, 80), expiresAt: resolvedExpiry, location: String(location || product.inventoryTracking.location || '').trim().slice(0, 80), userId: userId || null, assigneeId: assigneeId || null, unitCost: unitCost === undefined || unitCost === '' ? Number(product.inventoryTracking.defaultCost || 0) : Number(unitCost), unitPrice: type === 'manual_sale' ? Number(unitPrice) : 0, note: String(note).trim().slice(0, 500), actorId: actor(req)._id });
    return res.json({ success: true, data: entry });
  } catch (error) {
    await Material.updateOne({ _id: productId, tenantId: tenant(req) }, { $inc: { stock: -delta } });
    if (error.code === 11000) return bad(res, '这笔流水已保存，请刷新后查看', 409);
    throw error;
  }
}
adminRouter.post('/entries', addEntry);
staffRouter.post('/entries', addEntry);

adminRouter.post('/counts', async (req, res) => {
  const { productId, counted, note = '' } = req.body || {};
  if (!validId(productId) || counted === null || counted === undefined || String(counted).trim() === '' || !Number.isInteger(Number(counted)) || Number(counted) < 0 || !String(note).trim()) return bad(res, '请选择物资，填写实盘数量和差异依据');
  const product = await Material.findOne({ ...productFilter(req), _id: productId });
  if (!product) return bad(res, '物资不存在', 404);
  const before = Number(product.stock);
  const after = Number(counted);
  const updated = await Material.findOneAndUpdate({ ...productFilter(req), _id: productId, stock: before }, { $set: { stock: after } }, { new: true });
  if (!updated) return bad(res, '库存已变化，请刷新后重新盘点', 409);
  try {
    const entry = await InventoryEntry.create({ tenantId: tenant(req), productId, materialId: productId, type: 'count', quantity: after - before, units: Math.abs(after - before), balanceAfter: after, location: product.inventoryTracking.location, unitCost: Number(product.inventoryTracking.defaultCost || 0), note: String(note).trim().slice(0, 500), actorId: actor(req)._id });
    res.json({ success: true, data: entry });
  } catch (error) {
    await Material.updateOne({ _id: productId, tenantId: tenant(req), stock: after }, { $set: { stock: before } });
    throw error;
  }
});

adminRouter.get('/consumption', async (req, res) => {
  const productIds = [...new Set((await Material.find(productFilter(req)).select('linkedProductIds').lean()).flatMap(p => p.linkedProductIds.map(String)))];
  const [manual, orders] = await Promise.all([
    InventoryEntry.find({ tenantId: tenant(req), type: { $in: ['use', 'manual_sale'] }, userId: { $ne: null } }).sort({ createdAt: -1 }).limit(500).populate('productId', 'name').populate('materialId', 'name').populate('serviceProductId', 'name').populate('userId', 'name').lean(),
    Order.find({ tenantId: tenant(req), serviceId: { $in: productIds }, orderType: 'product', paymentStatus: 'paid', tradeStatus: { $nin: ['closed', 'refunded'] } }).sort({ createdAt: -1 }).limit(500).select('user serviceId serviceName servicePrice paidAmount createdAt orderNo paymentStatus tradeStatus').populate('user', 'name').lean(),
  ]);
  res.json({ success: true, data: { manual: manual.map(row => ({ ...row, productId: row.materialId || row.productId })), orders } });
});

staffRouter.get('/patients/:id/consumption', async (req, res) => {
  if (!validId(req.params.id) || !await User.exists({ _id: req.params.id, tenantId: tenant(req) })) return bad(res, '客户不存在', 404);
  const productIds = [...new Set((await Material.find(productFilter(req)).select('linkedProductIds').lean()).flatMap(p => p.linkedProductIds.map(String)))];
  const [manual, orders] = await Promise.all([
    InventoryEntry.find({ tenantId: tenant(req), userId: req.params.id, type: { $in: ['use', 'manual_sale'] } }).sort({ createdAt: -1 }).populate('productId', 'name').populate('materialId', 'name').populate('serviceProductId', 'name').lean(),
    Order.find({ tenantId: tenant(req), user: req.params.id, serviceId: { $in: productIds }, orderType: 'product', paymentStatus: 'paid', tradeStatus: { $nin: ['closed', 'refunded'] } }).sort({ createdAt: -1 }).select('serviceId serviceName servicePrice paidAmount createdAt orderNo').lean(),
  ]);
  res.json({ success: true, data: { manual: manual.map(row => ({ ...row, productId: row.materialId || row.productId })), orders } });
});

module.exports = { adminRouter, staffRouter };
