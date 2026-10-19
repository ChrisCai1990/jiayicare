const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const InventoryEntry = require('../models/InventoryEntry');
const Admin = require('../models/Admin');
const adminAuth = require('../middleware/adminAuth');
const staffAuth = require('../middleware/staffAuth');
const checkPermission = require('../middleware/checkPermission');

const adminRouter = express.Router();
const staffRouter = express.Router();
adminRouter.use(adminAuth);
staffRouter.use(staffAuth, checkPermission('products', 'view'), checkPermission('patients', 'view'));

function tenant(req) { return req.admin?.tenantId || req.staff?.tenantId; }
function actor(req) { return req.admin || req.staff; }
function bad(res, message, status = 400) { return res.status(status).json({ success: false, message }); }
function validId(value) { return mongoose.isValidObjectId(value); }
function productFilter(req) { return { tenantId: tenant(req), 'inventoryTracking.enabled': true }; }

async function list(req, res) {
  const products = await Product.find(productFilter(req)).select('name category originalPrice stock stockLimited inventoryTracking status').sort({ name: 1 }).lean();
  const ids = products.map(p => p._id);
  const legacyOpenings = ids.length ? await InventoryEntry.find({ tenantId: tenant(req), productId: { $in: ids }, type: 'opening', note: '启用台账时的期初库存；请与实物核对' }).select('productId createdAt').lean() : [];
  const legacyByProduct = new Map(legacyOpenings.map(row => [String(row.productId), row.createdAt]));
  const counts = legacyOpenings.length ? await InventoryEntry.find({ tenantId: tenant(req), productId: { $in: legacyOpenings.map(row => row.productId) }, type: 'count' }).select('productId createdAt').lean() : [];
  const countedProducts = new Set(counts.filter(row => row.createdAt >= legacyByProduct.get(String(row.productId))).map(row => String(row.productId)));
  products.forEach(product => { product.needsOpeningCount = legacyByProduct.has(String(product._id)) && !countedProducts.has(String(product._id)); });
  const recent = ids.length ? await InventoryEntry.find({ tenantId: tenant(req), productId: { $in: ids } })
    .sort({ createdAt: -1 }).limit(100).populate('userId', 'name patientNo').populate('actorId', 'name').lean() : [];
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

adminRouter.post('/products/:id/enable', async (req, res) => {
  if (!validId(req.params.id)) return bad(res, '商品编号无效');
  const product = await Product.findOne({ _id: req.params.id, tenantId: tenant(req) });
  if (!product) return bad(res, '商品不存在', 404);
  if (product.inventoryTracking?.enabled) return bad(res, '该商品已启用物资台账');
  const { kind = 'consumable', unit = '件', minStock = 0, defaultCost = 0, location = '', openingQuantity, openingNote = '' } = req.body || {};
  if (!['consumable', 'reusable'].includes(kind) || !Number.isInteger(Number(minStock)) || Number(minStock) < 0 || !Number.isFinite(Number(defaultCost)) || Number(defaultCost) < 0) return bad(res, '物资参数无效');
  if (openingQuantity === undefined || openingQuantity === null || String(openingQuantity).trim() === '' || !Number.isInteger(Number(openingQuantity)) || Number(openingQuantity) < 0 || !String(openingNote).trim()) return bad(res, '请填写实盘期初数量和清点依据');
  const oldStock = Number(product.stock);
  const oldTracking = product.inventoryTracking?.toObject?.() || product.inventoryTracking;
  const oldStockLimited = product.stockLimited;
  const tracking = { enabled: true, kind, unit: String(unit).trim().slice(0, 20) || '件', minStock: Number(minStock), defaultCost: Number(defaultCost), location: String(location).trim().slice(0, 80) };
  const opening = Number(openingQuantity);
  const updated = await Product.findOneAndUpdate(
    { _id: product._id, tenantId: tenant(req), 'inventoryTracking.enabled': { $ne: true }, stock: oldStock },
    { $set: { inventoryTracking: tracking, stock: opening, stockLimited: true } }, { new: true },
  );
  if (!updated) return bad(res, '商品库存已变化，请刷新后重新核实期初', 409);
  try {
    await InventoryEntry.create({ tenantId: tenant(req), productId: product._id, type: 'opening', quantity: opening, units: opening, balanceAfter: opening, unitCost: Number(defaultCost), location: tracking.location, actorId: actor(req)._id, note: `实盘期初；原商城展示库存 ${oldStock} 未核实、不计入台账。依据：${String(openingNote).trim()}`.slice(0, 500) });
  } catch (error) {
    await Product.updateOne({ _id: product._id, tenantId: tenant(req), stock: opening, 'inventoryTracking.enabled': true }, { $set: { stock: oldStock, stockLimited: oldStockLimited, inventoryTracking: oldTracking } });
    throw error;
  }
  res.json({ success: true, data: updated });
});

adminRouter.patch('/products/:id/settings', async (req, res) => {
  if (!validId(req.params.id)) return bad(res, '商品编号无效');
  const product = await Product.findOne({ ...productFilter(req), _id: req.params.id });
  if (!product) return bad(res, '物资不存在', 404);
  const { minStock, defaultCost, location } = req.body || {};
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
  const { productId, type, units, batchNo = '', serialNo = '', expiresAt, location = '', userId, assigneeId, fromIssued = false, orderId, unitCost, unitPrice, note = '' } = req.body || {};
  if (!validId(productId)) return bad(res, '请选择物资');
  if (!['receipt', 'issue', 'use', 'return', 'loss', 'manual_sale'].includes(type)) return bad(res, '流水类型无效');
  if (req.staff && !['issue', 'use', 'return', 'manual_sale'].includes(type)) return bad(res, '该操作需在管理后台办理', 403);
  const amount = Number(units);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000) return bad(res, '数量须为正整数');
  if ((type === 'use' || type === 'manual_sale') && !validId(userId)) return bad(res, '请关联实际使用或购买的客户');
  if (['issue', 'return'].includes(type) && !validId(assigneeId)) return bad(res, '请指定领用或归还人员');
  if (fromIssued && type !== 'use') return bad(res, '只有实际使用可关联已领用物资');
  if (fromIssued && !validId(assigneeId)) return bad(res, '请指定此前领用人员');
  if (orderId && (type !== 'use' || fromIssued || !validId(orderId))) return bad(res, '商城订单只能关联实际使用，且不能重复关联已领用物资');
  if (type === 'manual_sale' && fromIssued) return bad(res, '手工销售不能重复使用已领用记录');
  if (type === 'manual_sale' && !String(note).trim()) return bad(res, '请填写消费或收款凭据');
  const product = await Product.findOne({ ...productFilter(req), _id: productId });
  if (!product) return bad(res, '物资不存在', 404);
  if (product.inventoryTracking.kind === 'reusable' && (amount !== 1 || !String(serialNo).trim())) return bad(res, '可重复使用设备须逐台登记序列号');
  if (product.inventoryTracking.kind === 'reusable' && type === 'use' && !fromIssued && !orderId) return bad(res, '设备使用请关联领用人或已购买订单');
  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) return bad(res, '有效期无效');
  if (type === 'manual_sale' && req.staff && Number(unitPrice) !== Number(product.originalPrice)) return bad(res, '成交价须使用后台维护的售价；调价请由管理后台处理', 403);
  if (userId && !await User.exists({ _id: userId, tenantId: tenant(req) })) return bad(res, '客户不存在', 404);
  if (orderId) {
    const paidOrder = await Order.findOne({ _id: orderId, tenantId: tenant(req), user: userId, serviceId: String(productId), paymentStatus: 'paid', tradeStatus: { $nin: ['closed', 'refunded'] } });
    if (!paidOrder || amount !== 1) return bad(res, '请选择该客户已付款且未关闭的单件商品订单');
    if (await InventoryEntry.exists({ tenantId: tenant(req), orderId, type: 'use' })) return bad(res, '该订单已记录实际使用', 409);
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
  if (type === 'use' && (fromIssued || orderId)) delta = 0;
  const updated = await Product.findOneAndUpdate(
    { ...productFilter(req), _id: productId, ...(delta < 0 ? { stock: { $gte: -delta } } : {}) },
    { $inc: { stock: delta } }, { new: true },
  );
  if (!updated) return bad(res, '可用库存不足或物资状态已变化', 409);
  try {
    const entry = await InventoryEntry.create({ tenantId: tenant(req), productId, type, quantity: delta, units: amount, fromIssued: !!fromIssued, orderId: orderId || null, balanceAfter: Number(updated.stock), batchNo: String(batchNo).trim().slice(0, 80), serialNo: String(serialNo).trim().slice(0, 80), expiresAt: expiresAt || null, location: String(location || product.inventoryTracking.location || '').trim().slice(0, 80), userId: userId || null, assigneeId: assigneeId || null, unitCost: unitCost === undefined || unitCost === '' ? Number(product.inventoryTracking.defaultCost || 0) : Number(unitCost), unitPrice: type === 'manual_sale' ? Number(unitPrice) : 0, note: String(note).trim().slice(0, 500), actorId: actor(req)._id });
    return res.json({ success: true, data: entry });
  } catch (error) {
    await Product.updateOne({ _id: productId, tenantId: tenant(req) }, { $inc: { stock: -delta } });
    if (error.code === 11000) return bad(res, '该订单已记录实际使用，请刷新', 409);
    throw error;
  }
}
adminRouter.post('/entries', addEntry);
staffRouter.post('/entries', checkPermission('products', 'create'), addEntry);

adminRouter.post('/counts', async (req, res) => {
  const { productId, counted, note = '' } = req.body || {};
  if (!validId(productId) || !Number.isInteger(Number(counted)) || Number(counted) < 0 || !String(note).trim()) return bad(res, '请选择物资，填写实盘数量和差异依据');
  const product = await Product.findOne({ ...productFilter(req), _id: productId });
  if (!product) return bad(res, '物资不存在', 404);
  const before = Number(product.stock);
  const after = Number(counted);
  const updated = await Product.findOneAndUpdate({ ...productFilter(req), _id: productId, stock: before }, { $set: { stock: after } }, { new: true });
  if (!updated) return bad(res, '库存已变化，请刷新后重新盘点', 409);
  try {
    const entry = await InventoryEntry.create({ tenantId: tenant(req), productId, type: 'count', quantity: after - before, units: Math.abs(after - before), balanceAfter: after, location: product.inventoryTracking.location, unitCost: Number(product.inventoryTracking.defaultCost || 0), note: String(note).trim().slice(0, 500), actorId: actor(req)._id });
    res.json({ success: true, data: entry });
  } catch (error) {
    await Product.updateOne({ _id: productId, tenantId: tenant(req), stock: after }, { $set: { stock: before } });
    throw error;
  }
});

adminRouter.get('/consumption', async (req, res) => {
  const productIds = (await Product.find(productFilter(req)).select('_id').lean()).map(p => String(p._id));
  const [manual, orders] = await Promise.all([
    InventoryEntry.find({ tenantId: tenant(req), type: { $in: ['use', 'manual_sale'] }, userId: { $ne: null } }).sort({ createdAt: -1 }).limit(500).populate('productId', 'name').populate('userId', 'name').lean(),
    Order.find({ tenantId: tenant(req), serviceId: { $in: productIds }, orderType: 'product', paymentStatus: 'paid', tradeStatus: { $nin: ['closed', 'refunded'] } }).sort({ createdAt: -1 }).limit(500).select('user serviceId serviceName servicePrice paidAmount createdAt orderNo paymentStatus tradeStatus').populate('user', 'name').lean(),
  ]);
  res.json({ success: true, data: { manual, orders } });
});

staffRouter.get('/patients/:id/consumption', async (req, res) => {
  if (!validId(req.params.id) || !await User.exists({ _id: req.params.id, tenantId: tenant(req) })) return bad(res, '客户不存在', 404);
  const productIds = (await Product.find(productFilter(req)).select('_id').lean()).map(p => String(p._id));
  const [manual, orders] = await Promise.all([
    InventoryEntry.find({ tenantId: tenant(req), userId: req.params.id, type: { $in: ['use', 'manual_sale'] } }).sort({ createdAt: -1 }).populate('productId', 'name').lean(),
    Order.find({ tenantId: tenant(req), user: req.params.id, serviceId: { $in: productIds }, orderType: 'product', paymentStatus: 'paid', tradeStatus: { $nin: ['closed', 'refunded'] } }).sort({ createdAt: -1 }).select('serviceId serviceName servicePrice paidAmount createdAt orderNo').lean(),
  ]);
  res.json({ success: true, data: { manual, orders } });
});

module.exports = { adminRouter, staffRouter };
