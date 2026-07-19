import React, { useState, useCallback } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { ordersAPI } from '../../services/api';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';

const STATUS_META = {
  pending: { label: '待处理', color: colors.warning },
  confirmed: { label: '已确认', color: colors.info },
  completed: { label: '已完成', color: colors.success },
  cancelled: { label: '已取消', color: colors.textMuted },
};

export default function OrdersPage() {
  const { statusBarHeight } = useNavBar();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    ordersAPI.list().then((res) => { if (res.success) setList(res.data || []); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  useDidShow(() => { load(); });

  const cancel = async (id) => {
    try {
      await ordersAPI.cancel(id);
      Taro.showToast({ title: '已取消', icon: 'success' });
      load();
    } catch (err) {
      Taro.showToast({ title: err.message || '取消失败', icon: 'none' });
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

      <View style={{ padding: `${spacing.lg}px` }}>
      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
      ) : list.length === 0 ? (
        <View style={{ textAlign: 'center', padding: `${spacing.xxl}px 0` }}>
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无订单</Text>
        </View>
      ) : (
        list.map((o) => {
          const meta = STATUS_META[o.status] || STATUS_META.pending;
          return (
            <View key={o._id} style={{
              backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: '10px', boxShadow: shadow.card,
            }}>
              <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>{o.serviceName || o.itemName || '服务订单'}</Text>
                <Text style={{ fontSize: '12px', color: meta.color, fontWeight: 700 }}>{meta.label}</Text>
              </View>
              <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block' }}>
                {o.createdAt ? new Date(o.createdAt).toLocaleString('zh-CN') : ''}
              </Text>
              {o.price != null && (
                <Text style={{ fontSize: '15px', fontWeight: 800, color: colors.primary, display: 'block', marginTop: '6px' }}>¥{o.price}</Text>
              )}
              {o.status === 'pending' && (
                <View
                  onClick={() => cancel(o._id)}
                  style={{ marginTop: '10px', display: 'inline-block', padding: '6px 14px', border: `1px solid ${colors.border}`, borderRadius: `${radius.full}px` }}
                >
                  <Text style={{ fontSize: '12px', color: colors.textSecondary }}>取消订单</Text>
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
