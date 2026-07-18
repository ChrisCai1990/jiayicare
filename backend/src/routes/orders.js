const express = require('express');
const auth = require('../middleware/auth');
const Order = require('../models/Order');
const FollowUp = require('../models/FollowUp');
const { refundOrderPoints } = require('../utils/orderPoints');
const router = express.Router();

// 获取当前用户的订单列表
router.get('/', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取订单失败', error: err.message });
  }
});

// 获取单个订单详情
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取订单失败', error: err.message });
  }
});

// 取消订单（仅限 pending 状态）
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: '该订单状态不可取消' });
    }
    order.status = 'cancelled';
    await order.save();
    await refundOrderPoints(order); // 若下单时预记过消费积分，取消订单要退回
    // 联动取消该订单生成的随访待办（sourceType='order'），此前只改订单状态，随访记录仍是 planned，
    // 导致用户端"待办任务"和医护端工作台永久残留一条订单已取消却还在等安排的僵尸待办
    await FollowUp.updateMany(
      { sourceOrderId: order._id, status: { $nin: ['completed', 'cancelled'] } },
      { $set: { status: 'cancelled', cancelReason: '订单已取消' } }
    );
    res.json({ success: true, message: '订单已取消', data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: '取消失败', error: err.message });
  }
});

module.exports = router;
