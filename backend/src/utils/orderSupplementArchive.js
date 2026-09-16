const Product = require('../models/Product');
const Supplement = require('../models/Supplement');

function isSupplementOrder(order = {}, product = {}) {
  const workflowKey = order.serviceWorkflowSnapshot?.key || product.serviceWorkflow?.key || '';
  if (workflowKey) return workflowKey === 'supplement_supply';
  const text = [product.category, product.name, order.serviceName].filter(Boolean).join(' ');
  return /营养素|营养补充|维生素|叶酸|益生菌|鱼油|蛋白粉|辅酶Q10|矿物质/.test(text);
}

function buildSupplementDraft(order, product = {}) {
  const specification = String(order.specificationLabel || '').trim();
  const quantity = Number(order.totalUnits) > 1 ? `${order.totalUnits}份` : '';
  const purchaseFacts = [
    `商城购买：${order.serviceName}`,
    specification && `规格：${specification}`,
    quantity && `订单数量：${quantity}`,
    order.orderNo && `订单号：${order.orderNo}`,
  ].filter(Boolean).join('；');
  return {
    user: order.user,
    name: String(product.name || order.serviceName || '营养素').trim(),
    brand: '',
    specification,
    dosage: '待营养师确认',
    method: '待营养师确认',
    frequency: '待营养师确认',
    startDate: '', endDate: '',
    purpose: '客户商城购买，待营养师核对是否适合补充及是否需要调整',
    note: `${purchaseFacts}。本记录仅表示购买事实，剂量、频次、服用方法及周期须经营养师审核。`,
    imageUrls: (product.images || []).map(String).filter(Boolean).slice(0, 6),
    createdByStaff: false,
    createdByName: '商城订单自动写入',
    aiStatus: 'pending',
    aiGeneratedBy: '商城营养素订单',
    sourceType: 'order',
    sourceOrderId: order._id,
    sourceRecordKey: `order:${order._id}`,
  };
}

async function ensureOrderSupplementDraft(order) {
  if (!order?._id || !order.user || order.paymentStatus !== 'paid') return null;
  const product = await Product.findById(order.serviceId).select('name category images serviceWorkflow').lean().catch(() => null);
  if (!isSupplementOrder(order, product || {})) return null;
  try {
    return await Supplement.findOneAndUpdate(
      { sourceOrderId: order._id },
      { $setOnInsert: buildSupplementDraft(order, product || {}) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return Supplement.findOne({ sourceOrderId: order._id });
  }
}

module.exports = { isSupplementOrder, buildSupplementDraft, ensureOrderSupplementDraft };
