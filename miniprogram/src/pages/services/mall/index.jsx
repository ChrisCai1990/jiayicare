import React, { useState, useEffect } from 'react';
import { View, Text, Textarea } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { servicesAPI } from '../../../services/api';

// 简化实现：服务列表 + 预约下单，完整版含多规格/健康基金抵扣/优惠券见 app/src/screens/services/ServiceMallScreen.js
export default function ServiceMallPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderItem, setOrderItem] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    servicesAPI.list().then((res) => { if (res.success) setList(res.data || []); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    if (!orderItem) return;
    setSubmitting(true);
    try {
      const res = await servicesAPI.order(orderItem.id, note);
      if (res.success) {
        Taro.showToast({ title: '预约申请已提交', icon: 'success' });
        setOrderItem(null);
        setNote('');
      } else {
        Taro.showToast({ title: res.message || '提交失败', icon: 'none' });
      }
    } catch (err) {
      Taro.showToast({ title: err.message || '网络错误', icon: 'none' });
    } finally { setSubmitting(false); }
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${spacing.lg}px` }}>
      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
      ) : list.length === 0 ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无可预约服务</Text>
      ) : (
        list.map((item) => (
          <View key={item.id} style={{
            backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: '10px', boxShadow: shadow.card,
          }}>
            <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{item.name}</Text>
            <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', margin: '4px 0 10px' }}>{item.description || item.desc}</Text>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: '16px', fontWeight: 800, color: colors.primary }}>¥{item.price}</Text>
              <View
                onClick={() => setOrderItem(item)}
                style={{ padding: '8px 18px', backgroundColor: colors.primary, borderRadius: `${radius.full}px` }}
              >
                <Text style={{ fontSize: '12px', color: '#fff', fontWeight: 700 }}>立即预约</Text>
              </View>
            </View>
          </View>
        ))
      )}

      {orderItem && (
        <View style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'flex-end', zIndex: 999,
        }}>
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.xl}px ${radius.xl}px 0 0`, padding: `${spacing.lg}px`, width: '100%' }}>
            <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '4px' }}>{orderItem.name}</Text>
            <Text style={{ fontSize: '18px', fontWeight: 800, color: colors.primary, display: 'block', marginBottom: `${spacing.md}px` }}>¥{orderItem.price}</Text>
            <Textarea
              style={{ width: '100%', border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px', minHeight: '60px' }}
              placeholder="备注（可选）"
              value={note}
              onInput={(e) => setNote(e.detail.value)}
            />
            <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.lg}px` }}>
              <View style={{ flex: 1, textAlign: 'center', padding: '12px 0', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }}
                onClick={() => { setOrderItem(null); setNote(''); }}>
                <Text style={{ fontSize: '15px', color: colors.textSecondary, fontWeight: 600 }}>取消</Text>
              </View>
              <View style={{ flex: 1, textAlign: 'center', padding: '12px 0', borderRadius: `${radius.md}px`, backgroundColor: colors.primary }}
                onClick={submit}>
                <Text style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>{submitting ? '提交中...' : '提交预约'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
