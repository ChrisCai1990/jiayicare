import React, { useState, useCallback } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { ordersAPI, paymentsAPI } from '../../services/api';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';
import { requestWechatPayment, waitForPayment } from '../../utils/wechatPay';
import { ORDER_TABS, formatOrderTime, getOrderCategory, getOrderCounts } from '../../utils/orderStatus';

const STATUS_META = {
  pending: { label: '待处理', color: colors.warning },
  confirmed: { label: '已确认', color: colors.info },
  completed: { label: '已完成', color: colors.success },
  cancelled: { label: '已取消', color: colors.textMuted },
};

const TRADE_STATUS_META = {
  created: { label: '订单已创建', color: colors.textMuted },
  awaiting_payment: { label: '待支付', color: colors.warning },
  paid: { label: '已支付·待安排', color: colors.info },
  fulfilling: { label: '服务中', color: colors.info },
  completed: { label: '已完成', color: colors.success },
  closed: { label: '已关闭', color: colors.textMuted },
  refund_pending: { label: '退款处理中', color: colors.warning },
  partially_refunded: { label: '部分退款', color: colors.warning },
  refunded: { label: '已退款', color: colors.textMuted },
};

const FULFILLMENT_LABELS = {
  pending_assignment: '等待分配服务人员', awaiting_booking: '等待预约', booked: '已预约',
  awaiting_shipment: '等待配送', shipped: '已配送', in_service: '服务进行中', completed: '服务已完成', cancelled: '履约已取消',
};

export default function OrdersPage() {
  const { statusBarHeight } = useNavBar();
  const router = useRouter();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const initialTab = ORDER_TABS.some((tab) => tab.key === router.params?.tab) ? router.params.tab : 'all';
  const [activeTab, setActiveTab] = useState(initialTab);

  const load = useCallback(() => {
    setLoading(true);
    ordersAPI.list().then((res) => { if (res.success) setList(res.data || []); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  useDidShow(() => { load(); });

  const counts = getOrderCounts(list);
  const visibleList = activeTab === 'all' ? list : list.filter((order) => getOrderCategory(order) === activeTab);

  const cancel = async (id) => {
    try {
      await ordersAPI.cancel(id);
      Taro.showToast({ title: '已取消', icon: 'success' });
      load();
    } catch (err) {
      Taro.showToast({ title: err.message || '取消失败', icon: 'none' });
    }
  };

  const requestRefund = async (id) => {
    const modal = await Taro.showModal({ title: '申请退款', content: '提交后工作人员将核对服务履约情况，审核通过后由微信原路退回。是否继续？', confirmText: '提交申请' });
    if (!modal.confirm) return;
    try {
      const result = await ordersAPI.requestRefund(id, '用户在小程序订单页主动申请退款');
      Taro.showToast({ title: result.message || '已提交', icon: 'none' });
      load();
    } catch (err) {
      Taro.showToast({ title: err.message || '提交失败', icon: 'none' });
    }
  };

  const continuePayment = async (id) => {
    try {
      const result = await paymentsAPI.retry(id);
      if (result.data?.paymentParams) {
        await requestWechatPayment(result.data.paymentParams);
        await waitForPayment(id);
      }
      Taro.showToast({ title: '支付成功', icon: 'success' });
      load();
    } catch (err) {
      Taro.showToast({ title: err.message || '支付失败', icon: 'none' });
    }
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`,
        backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`,
      }}>
        <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>我的订单</Text>
        <View style={{ width: '28px' }} />
      </View>

      <View style={{ backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap', overflowX: 'auto' }}>
        <View style={{ display: 'inline-flex', minWidth: '100%', padding: '0 8px' }}>
          {ORDER_TABS.map((tab) => (
            <View key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ flex: tab.key === 'afterSale' ? 1.25 : 1, minWidth: tab.key === 'afterSale' ? '76px' : '58px', textAlign: 'center', padding: '13px 4px 10px', borderBottom: activeTab === tab.key ? `2px solid ${colors.primary}` : '2px solid transparent' }}>
              <Text style={{ fontSize: '12px', color: activeTab === tab.key ? colors.primary : colors.textSecondary, fontWeight: activeTab === tab.key ? 700 : 500 }}>
                {tab.label}{counts[tab.key] > 0 && tab.key !== 'all' ? ` ${counts[tab.key]}` : ''}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ padding: `${spacing.lg}px` }}>
      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
      ) : visibleList.length === 0 ? (
        <View style={{ textAlign: 'center', padding: `${spacing.xxl}px 0` }}>
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>{list.length === 0 ? '暂无订单' : '当前分类暂无订单'}</Text>
        </View>
      ) : (
        visibleList.map((o) => {
          const meta = TRADE_STATUS_META[o.tradeStatus] || STATUS_META[o.status] || STATUS_META.pending;
          return (
            <View key={o._id} style={{
              backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: '10px', boxShadow: shadow.card,
            }}>
              <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>{o.serviceName || o.itemName || '服务订单'}</Text>
                <Text style={{ fontSize: '12px', color: meta.color, fontWeight: 700 }}>{meta.label}</Text>
              </View>
              <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block' }}>
                {formatOrderTime(o.createdAt)}
              </Text>
              {o.servicePrice != null && (
                <Text style={{ fontSize: '15px', fontWeight: 800, color: colors.primary, display: 'block', marginTop: '6px' }}>¥{o.servicePrice}</Text>
              )}
              {!!o.fulfillmentId?.status && (
                <Text style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginTop: '6px' }}>
                  服务进度：{FULFILLMENT_LABELS[o.fulfillmentId.status] || o.fulfillmentId.status}
                </Text>
              )}
              {o.status === 'pending' && !['paid', 'fulfilling', 'refund_pending', 'refunded'].includes(o.tradeStatus) && (
                <View
                  onClick={() => cancel(o._id)}
                  style={{ marginTop: '10px', display: 'inline-block', padding: '6px 14px', border: `1px solid ${colors.border}`, borderRadius: `${radius.full}px` }}
                >
                  <Text style={{ fontSize: '12px', color: colors.textSecondary }}>取消订单</Text>
                </View>
              )}
              {o.tradeStatus === 'awaiting_payment' && o.paymentStatus !== 'failed' && (
                <View onClick={() => continuePayment(o._id)} style={{ marginTop: '10px', marginLeft: '8px', display: 'inline-block', padding: '6px 14px', backgroundColor: colors.primary, borderRadius: `${radius.full}px` }}>
                  <Text style={{ fontSize: '12px', color: '#fff' }}>继续支付</Text>
                </View>
              )}
              {o.paymentStatus === 'paid' && !['requested', 'processing', 'refunded'].includes(o.refundStatus) && o.status !== 'completed' && (
                <View
                  onClick={() => requestRefund(o._id)}
                  style={{ marginTop: '10px', marginLeft: '8px', display: 'inline-block', padding: '6px 14px', border: `1px solid ${colors.danger}`, borderRadius: `${radius.full}px` }}
                >
                  <Text style={{ fontSize: '12px', color: colors.danger }}>申请退款</Text>
                </View>
              )}
            </View>
          );
        })
      )}
      </View>
    </View>
  );
}
