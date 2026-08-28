import React, { useEffect, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAuth } from '../../../context/AuthContext';
import { userAPI } from '../../../services/api';
import { colors, radius, spacing } from '../../../theme';
import useNavBar from '../../../hooks/useNavBar';

export default function InvitePage() {
  const { user } = useAuth();
  const { statusBarHeight } = useNavBar();
  const [code, setCode] = useState(user?.referralCode || '');
  useEffect(() => { userAPI.referrals().then(res => res?.success && setCode(res.data?.referralCode || '')).catch(() => {}); }, []);
  Taro.useShareAppMessage(() => ({
    title: '邀请你使用嘉医汇健康管理',
    path: `/pages/home/index?invite=${encodeURIComponent(code)}`,
    success: () => Taro.showModal({
      title: '感谢分享',
      content: '感谢你把健康理念分享给好友。健康可控，人生方可从容。',
      showCancel: false,
      confirmText: '好的',
    }),
  }));
  return <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
    <View style={{ padding: `${statusBarHeight + 14}px ${spacing.lg}px 28px`, backgroundColor: colors.primary, textAlign: 'center' }}>
      <Text style={{ display: 'block', color: '#fff', fontSize: '22px', fontWeight: 800 }}>邀请好友</Text>
      <Text style={{ display: 'block', color: 'rgba(255,255,255,.82)', fontSize: '14px', marginTop: '10px' }}>一起开启健康管理</Text>
    </View>
    <View style={{ margin: `${spacing.lg}px`, padding: '28px 22px', backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, textAlign: 'center' }}>
      <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>把健康理念分享给身边的人</Text>
      <Text style={{ display: 'block', marginTop: '8px', fontSize: '14px', lineHeight: '22px', color: colors.textSecondary }}>一份关注，也许就是朋友开始重视健康的契机</Text>
      <Button openType="share" disabled={!code} style={{ marginTop: '24px', backgroundColor: colors.primary, color: '#fff', border: 'none', borderRadius: `${radius.full}px`, fontSize: '16px', fontWeight: 700 }}>邀请好友</Button>
      <Text style={{ display: 'block', marginTop: '13px', color: colors.textMuted, fontSize: '12px' }}>点击按钮，选择微信好友发送</Text>
    </View>
  </View>;
}
