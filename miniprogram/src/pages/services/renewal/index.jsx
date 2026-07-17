import React, { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { servicesAPI } from '../../../services/api';

// 服务包目录：pkg_1y(年度¥2980) / pkg_6m(半年¥1680) / pkg_3m(季度¥980)，与后端 PACKAGE_CATALOG 对齐
const PACKAGES = [
  { id: 'pkg_1y', name: '年度服务包', duration: '12 个月', price: 2980, originalPrice: 5000 },
  { id: 'pkg_6m', name: '半年服务包', duration: '6 个月', price: 1680, originalPrice: 2800 },
  { id: 'pkg_3m', name: '季度服务包', duration: '3 个月', price: 980, originalPrice: 1480 },
];

export default function RenewalPage() {
  const [submitting, setSubmitting] = useState(null);

  const buy = async (pkg) => {
    setSubmitting(pkg.id);
    try {
      const res = await servicesAPI.order(pkg.id, `续约：${pkg.name}`, 'wechat');
      if (res.success) {
        Taro.showToast({ title: '订单已提交，请前往我的订单查看', icon: 'success' });
        setTimeout(() => Taro.navigateTo({ url: '/pages/orders/index' }), 1000);
      } else {
        Taro.showToast({ title: res.message || '提交失败', icon: 'none' });
      }
    } catch (err) {
      Taro.showToast({ title: err.message || '网络错误', icon: 'none' });
    } finally { setSubmitting(null); }
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${spacing.lg}px` }}>
      <Text style={{ fontSize: '18px', fontWeight: 800, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.lg}px` }}>选择服务包续约</Text>
      {PACKAGES.map((pkg) => (
        <View key={pkg.id} style={{
          backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.lg}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card,
        }}>
          <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{pkg.name}</Text>
          <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', margin: '4px 0 12px' }}>服务期 {pkg.duration}</Text>
          <View style={{ display: 'flex', alignItems: 'baseline', marginBottom: `${spacing.md}px` }}>
            <Text style={{ fontSize: '24px', fontWeight: 800, color: colors.primary }}>¥{pkg.price}</Text>
            <Text style={{ fontSize: '13px', color: colors.textMuted, textDecoration: 'line-through', marginLeft: '8px' }}>¥{pkg.originalPrice}</Text>
          </View>
          <View
            onClick={() => buy(pkg)}
            style={{ textAlign: 'center', padding: '12px 0', backgroundColor: colors.primary, borderRadius: `${radius.md}px` }}
          >
            <Text style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>{submitting === pkg.id ? '提交中...' : '立即续约'}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
