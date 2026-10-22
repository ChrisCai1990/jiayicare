const mongoose = require('mongoose');
const Material = require('../models/InventoryMaterial');
const Product = require('../models/Product');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Order = require('../models/Order');
const InventoryEntry = require('../models/InventoryEntry');
const Dispatch = require('../models/InventoryDispatchRequest');

const validId = value => mongoose.isValidObjectId(value);
const bad = (res, message, status = 400) => res.status(status).json({ success: false, message });
const tenant = req => req.staff.tenantId;
const manager = req => ['healthManager', 'superadmin'].includes(req.staff.role);
const belongsToManager = (req, row) => req.staff.role === 'superadmin' || !row.assignedHealthManagerId
  || String(row.assignedHealthManagerId) === String(req.staff._id);
const payloadKeys = ['productId', 'type', 'units', 'sourceReceiptId', 'batchNo', 'serialNo', 'expiresAt',
  'location', 'userId', 'assigneeId', 'fromIssued', 'orderId', 'unitCost', 'serviceProductId', 'requestId', 'note'];

module.exports = function registerInventoryDispatches(router, addEntry) {
  async function queue(req, res) {
    const body = req.body || {};
    const { productId, type, units, userId, assigneeId, fromIssued, requestId, serviceProductId, orderId, sourceReceiptId } = body;
    if (!['issue', 'use'].includes(type)) return bad(res, '请选择领用或发放');
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId || '')) return bad(res, '请刷新页面后提交');
    const previous = await Dispatch.findOne({ tenantId: tenant(req), requestId });
    if (previous) {
      if (String(previous.actorId) !== String(req.staff._id)) return bad(res, '该申请编号已被使用，请刷新后重试', 409);
      return res.json({ success: true, data: previous, repeated: true });
    }
    const amount = Number(units);
    if (!validId(productId) || !Number.isInteger(amount) || amount < 1 || amount > 100000) return bad(res, '请选择物资并填写有效数量');
    if (type === 'use' && !validId(userId)) return bad(res, '发放或使用必须关联客户');
    if ((type === 'issue' || fromIssued) && !validId(assigneeId)) return bad(res, '请指定领用人员');
    if (fromIssued && type !== 'use') return bad(res, '只有实际使用可关联已领用物资');
    const material = await Material.findOne({ _id: productId, tenantId: tenant(req), 'inventoryTracking.enabled': true });
    if (!material) return bad(res, '物资不存在', 404);
    if (material.inventoryTracking.kind === 'reusable' && (amount !== 1 || !String(body.serialNo || '').trim())) return bad(res, '设备须逐台登记序列号');
    if (!fromIssued && Number(material.stock) < amount) return bad(res, '当前可用库存不足', 409);
    if (serviceProductId) {
      if (!validId(serviceProductId) || !material.linkedProductIds.some(id => String(id) === String(serviceProductId))) return bad(res, '所选服务未关联该物资');
      if (!await Product.exists({ _id: serviceProductId, tenantId: tenant(req) })) return bad(res, '关联服务不存在');
    }
    const customer = userId ? await User.findOne({ _id: userId, tenantId: tenant(req) })
      .select('name phone contactName contactPhone deliveryAddress assignedHealthManager').lean() : null;
    if (userId && !customer) return bad(res, '客户不存在', 404);
    const assignee = assigneeId ? await Admin.findOne({ _id: assigneeId, tenantId: tenant(req), staffStatus: { $ne: 'inactive' } }).select('name').lean() : null;
    if (assigneeId && !assignee) return bad(res, '领用人员不存在', 404);
    if (orderId) {
      if (type !== 'use' || !customer || !validId(orderId)) return bad(res, '消费来源订单无效');
      const order = await Order.findOne({ _id: orderId, tenantId: tenant(req), user: userId, paymentStatus: 'paid', tradeStatus: { $nin: ['closed', 'refunded'] } });
      if (!order || !material.linkedProductIds.some(id => String(id) === String(order.serviceId))) return bad(res, '该订单未关联所选物资');
    }
    if (sourceReceiptId && (!validId(sourceReceiptId) || !await InventoryEntry.exists({ _id: sourceReceiptId, tenantId: tenant(req), productId, type: 'receipt' }))) return bad(res, '入库批次不存在');
    const method = String(body.delivery?.method || '');
    if (!['pickup', 'shipping'].includes(method)) return bad(res, '请选择线下领取或寄送');
    if (method === 'shipping' && !customer) return bad(res, '寄送时请先选择客户');
    const delivery = {
      method,
      pickupBy: String(body.delivery?.pickupBy || (type === 'issue' ? assignee?.name : customer?.name) || '').trim().slice(0, 80),
      recipientName: String(body.delivery?.recipientName || customer?.contactName || customer?.name || '').trim().slice(0, 80),
      recipientPhone: String(body.delivery?.recipientPhone || customer?.contactPhone || customer?.phone || '').trim().slice(0, 50),
      deliveryAddress: String(body.delivery?.deliveryAddress || customer?.deliveryAddress || '').trim().slice(0, 300),
    };
    if (method === 'pickup' && !delivery.pickupBy) return bad(res, '请填写线下领取人');
    if (method === 'shipping' && (!delivery.recipientName || !delivery.recipientPhone || !delivery.deliveryAddress)) return bad(res, '请核实收件人、联系电话和地址');
    let managerId = customer?.assignedHealthManager || null;
    if (managerId && !await Admin.exists({ _id: managerId, tenantId: tenant(req), role: 'healthManager', staffStatus: { $ne: 'inactive' } })) managerId = null;
    const payload = Object.fromEntries(payloadKeys.map(key => [key, body[key]]));
    try {
      const request = await Dispatch.create({
        tenantId: tenant(req), requestId, type, materialId: productId, userId: customer?._id || null,
        actorId: req.staff._id, assignedHealthManagerId: managerId, payload, delivery,
      });
      return res.status(202).json({ success: true, data: request, message: '已提交健管专员确认出库，库存尚未扣减' });
    } catch (error) {
      if (error.code === 11000) return bad(res, '这笔申请已提交，请刷新查看', 409);
      throw error;
    }
  }

  router.get('/dispatches', async (req, res) => {
    const mine = req.query.view === 'mine';
    if (!mine && !manager(req)) return bad(res, '仅健管专员可查看待出库任务', 403);
    const filter = { tenantId: tenant(req) };
    if (mine) filter.actorId = req.staff._id;
    else {
      const stale = new Date(Date.now() - 5 * 60 * 1000);
      filter.$or = [{ status: 'pending' }, { status: 'processing', processingAt: { $lte: stale } }];
      if (req.staff.role !== 'superadmin') filter.assignedHealthManagerId = { $in: [req.staff._id, null] };
    }
    const items = await Dispatch.find(filter).sort({ createdAt: mine ? -1 : 1 }).limit(100)
      .populate('materialId', 'name inventoryTracking stock').populate('userId', 'name phone contactName contactPhone deliveryAddress')
      .populate('actorId', 'name').populate('assignedHealthManagerId', 'name').lean();
    res.json({ success: true, data: items });
  });

  router.post('/dispatches/:id/cancel', async (req, res) => {
    if (!validId(req.params.id)) return bad(res, '申请编号无效');
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (!reason) return bad(res, '请填写撤销原因');
    const request = await Dispatch.findOne({ _id: req.params.id, tenantId: tenant(req) });
    if (!request) return bad(res, '申请不存在', 404);
    if (String(request.actorId) !== String(req.staff._id) && !(manager(req) && belongsToManager(req, request))) return bad(res, '只能撤销本人申请或由健管专员处理', 403);
    const updated = await Dispatch.findOneAndUpdate(
      { _id: request._id, tenantId: tenant(req), status: 'pending' },
      { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: req.staff._id, cancellationReason: reason } },
      { new: true },
    );
    if (!updated) return bad(res, '申请已进入出库确认，请刷新', 409);
    res.json({ success: true, data: updated });
  });

  router.post('/dispatches/:id/complete', async (req, res) => {
    if (!validId(req.params.id)) return bad(res, '申请编号无效');
    const request = await Dispatch.findOne({ _id: req.params.id, tenantId: tenant(req) });
    if (!request) return bad(res, '申请不存在', 404);
    if (!manager(req) || !belongsToManager(req, request)) return bad(res, '仅对应健管专员可确认出库', 403);
    if (request.status === 'cancelled') return bad(res, '申请已撤销', 409);
    if (request.status === 'completed') return res.json({ success: true, data: request, repeated: true });
    const stale = new Date(Date.now() - 5 * 60 * 1000);
    const claimed = await Dispatch.findOneAndUpdate(
      { _id: request._id, tenantId: tenant(req), $or: [{ status: 'pending' }, { status: 'processing', processingAt: { $lte: stale } }] },
      { $set: { status: 'processing', processingAt: new Date() } }, { new: true },
    );
    if (!claimed) return bad(res, '其他专员正在处理，请稍后刷新', 409);
    const input = req.body || {};
    const delivery = {
      method: claimed.delivery.method,
      pickupBy: String(input.pickupBy || claimed.delivery.pickupBy || '').trim().slice(0, 80),
      recipientName: String(input.recipientName || claimed.delivery.recipientName || '').trim().slice(0, 80),
      recipientPhone: String(input.recipientPhone || claimed.delivery.recipientPhone || '').trim().slice(0, 50),
      deliveryAddress: String(input.deliveryAddress || claimed.delivery.deliveryAddress || '').trim().slice(0, 300),
      carrier: String(input.carrier || '').trim().slice(0, 100),
      trackingNo: String(input.trackingNo || '').trim().slice(0, 100),
    };
    if ((delivery.method === 'pickup' && !delivery.pickupBy)
      || (delivery.method === 'shipping' && (!delivery.recipientName || !delivery.recipientPhone || !delivery.deliveryAddress || !delivery.carrier || !delivery.trackingNo))) {
      await Dispatch.updateOne({ _id: claimed._id, status: 'processing' }, { $set: { status: 'pending', processingAt: null } });
      return bad(res, '请核实领取人或完整寄送信息');
    }
    let reply = null;
    const capture = { code: 200, status(code) { this.code = code; return this }, json(body) { reply = { code: this.code, body }; return body } };
    try {
      await addEntry({ ...req, body: claimed.payload, inventoryActor: { _id: claimed.actorId }, inventoryConfirmedBy: req.staff._id, inventoryDispatchId: claimed._id, inventoryDelivery: delivery }, capture);
      if (!reply?.body?.success) {
        await Dispatch.updateOne({ _id: claimed._id, status: 'processing' }, { $set: { status: 'pending', processingAt: null } });
        return res.status(reply?.code || 500).json(reply?.body || { success: false, message: '出库失败，请重试' });
      }
      const completed = await Dispatch.findOneAndUpdate(
        { _id: claimed._id, status: 'processing' },
        { $set: { status: 'completed', completedAt: new Date(), completedBy: req.staff._id, entryId: reply.body.data._id, delivery, processingAt: null } },
        { new: true },
      );
      return res.json({ success: true, data: completed, entry: reply.body.data });
    } catch (error) {
      await Dispatch.updateOne({ _id: claimed._id, status: 'processing' }, { $set: { status: 'pending', processingAt: null } });
      throw error;
    }
  });
  return queue;
};
