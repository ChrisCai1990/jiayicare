import React, { useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { servicesAPI } from '../../../services/api';
import { colors, radius, spacing } from '../../../theme';
import useNavBar from '../../../hooks/useNavBar';

export default function PartnerPromotionPage() {
  const { statusBarHeight, navBarHeight } = useNavBar();
  const [profile, setProfile] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  Taro.useDidShow(() => {
    setLoading(true);
    servicesAPI.myPartnerPromotion().then(res => {
      setProfile(res?.data || null);
      setError(res?.data ? '' : '当前账号没有已开通的市场合伙人身份');
    }).catch(err => setError(err?.message || '商品加载失败'))
      .finally(() => setLoading(false));
  });

  Taro.useShareAppMessage(({ target } = {}) => {
    const productId = target?.dataset?.productId;
    const product = profile?.products?.find(item => item.id === productId);
    if (!product || !profile?.referralCode) return { title: '嘉医汇服务', path: '/pages/home/index' };
    return { title: product.name,
      path: `/pages/services/mall/index?productId=${encodeURIComponent(product.id)}&partnerCode=${encodeURIComponent(profile.referralCode)}` };
  });

  const products = (profile?.products || []).filter(item => item.name.includes(keyword.trim()));
  return <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
    <View style={{ padding: `${statusBarHeight}px ${spacing.lg}px 18px`, backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}` }}>
      <View style={{ height: `${navBarHeight}px`, display: 'flex', alignItems: 'center' }}>
        <Text onClick={() => Taro.navigateBack()} style={{ width: '60px', color: colors.primary }}>‹ 返回</Text>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>我的推广</Text>
        <View style={{ width: '60px' }} />
      </View>
      <Text style={{ display: 'block', marginTop: '10px', color: colors.textSecondary, fontSize: '13px' }}>选择授权商品，分享给微信好友。客户打开商品卡片后可在商城购买。</Text>
    </View>
    {loading && <Text style={{ display: 'block', padding: '24px', color: colors.textMuted }}>加载中…</Text>}
    {!loading && error && <Text style={{ display: 'block', padding: '24px', color: colors.danger }}>{error}</Text>}
    {!loading && profile && <View style={{ padding: `${spacing.lg}px` }}>
      <Text style={{ display: 'block', marginBottom: '12px', fontSize: '14px', color: colors.textSecondary }}>{profile.name} · 已授权 {profile.products.length} 项商品</Text>
      <View style={{ marginBottom: '14px', padding: '16px', backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}` }}>
        <Text style={{ display: 'block', fontWeight: 700 }}>我的合作工作台</Text>
        <Text style={{ display: 'block', marginTop: '7px', fontSize: '13px', color: colors.textSecondary }}>团队、业务、佣金及已签协议可在网页工作台查看；使用登记的合伙人手机号登录。</Text>
        <Button size="mini" style={{ marginTop: '10px' }} onClick={() => Taro.setClipboardData({ data: 'https://admin.jiaycare.com/market-partner' })}>复制工作台地址</Button>
      </View>
      <Input value={keyword} onInput={event => setKeyword(event.detail.value)} placeholder="搜索授权商品"
        style={{ padding: '12px', backgroundColor: '#fff', border: `1px solid ${colors.border}`, borderRadius: `${radius.md}px`, marginBottom: '12px' }} />
      {products.length === 0 && <Text style={{ color: colors.textMuted }}>暂无匹配商品</Text>}
      {products.map(item => <View key={item.id} style={{ marginBottom: '10px', padding: '16px', backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}` }}>
        <Text style={{ display: 'block', fontWeight: 700, color: colors.textPrimary }}>{item.name}</Text>
        <View style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
          <Button size="mini" onClick={() => Taro.navigateTo({ url: `/pages/services/mall/index?productId=${encodeURIComponent(item.id)}` })}>查看商品</Button>
          <Button size="mini" openType="share" data-product-id={item.id} style={{ backgroundColor: colors.primary, color: '#fff', border: 'none' }}>分享给客户</Button>
        </View>
      </View>)}
    </View>}
  </View>;
}
