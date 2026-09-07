import React, { useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAuth } from '../../../context/AuthContext';
import { userAPI } from '../../../services/api';
import { colors, radius, spacing } from '../../../theme';
import useNavBar from '../../../hooks/useNavBar';
import inviteShareCover from '../../../assets/invite-share-cover.png';

export default function InvitePage() {
  const { user } = useAuth();
  const { statusBarHeight } = useNavBar();
  const [code, setCode] = useState(user?.referralCode || '');
  const [invitees, setInvitees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadReferrals = () => {
    setLoading(true);
    setError('');
    userAPI.referrals().then((res) => {
      if (!res?.success) return;
      setCode(res.data?.referralCode || '');
      setInvitees(Array.isArray(res.data?.invitees) ? res.data.invitees : []);
    }).catch((err) => {
      setError(err?.message || '邀请记录加载失败');
    }).finally(() => setLoading(false));
  };
  Taro.useDidShow(loadReferrals);
  Taro.useShareAppMessage(() => ({
    title: '邀请你一起关注健康',
    path: `/pages/auth/login/index?invite=${encodeURIComponent(code)}`,
    imageUrl: inviteShareCover,
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
      <Text style={{ display: 'block', color: 'rgba(255,255,255,.82)', fontSize: '14px', marginTop: '10px' }}>一起分享健康理念</Text>
    </View>
    <View style={{ margin: `${spacing.lg}px`, padding: '28px 22px', backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, textAlign: 'center' }}>
      <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>把健康理念分享给身边的人</Text>
      <Text style={{ display: 'block', marginTop: '8px', fontSize: '14px', lineHeight: '22px', color: colors.textSecondary }}>健康可控，人生方可从容。</Text>
      <Button openType="share" disabled={!code} style={{ marginTop: '24px', backgroundColor: colors.primary, color: '#fff', border: 'none', borderRadius: `${radius.full}px`, fontSize: '16px', fontWeight: 700 }}>邀请好友</Button>
      <Text style={{ display: 'block', marginTop: '13px', color: colors.textMuted, fontSize: '12px' }}>点击按钮，选择微信好友发送</Text>
    </View>
    <View style={{ margin: `0 ${spacing.lg}px ${spacing.lg}px`, padding: '20px', backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}` }}>
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>我的邀请记录</Text>
        <Text style={{ fontSize: '13px', color: colors.primary }}>共 {invitees.length} 人</Text>
      </View>
      {loading && <Text style={{ display: 'block', padding: '22px 0 6px', textAlign: 'center', color: colors.textMuted, fontSize: '13px' }}>正在加载…</Text>}
      {!loading && !!error && <Text style={{ display: 'block', padding: '22px 0 6px', textAlign: 'center', color: colors.danger, fontSize: '13px' }}>{error}</Text>}
      {!loading && !error && invitees.length === 0 && <Text style={{ display: 'block', padding: '22px 0 6px', textAlign: 'center', color: colors.textMuted, fontSize: '13px' }}>暂无成功邀请记录</Text>}
      {!loading && !error && invitees.map((item, index) => (
        <View key={item._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', borderTop: index === 0 ? 'none' : `1px solid ${colors.border}` }}>
          <View>
            <Text style={{ display: 'block', color: colors.textPrimary, fontSize: '14px', fontWeight: 600 }}>{item.name || '好友'}</Text>
            <Text style={{ display: 'block', marginTop: '5px', color: colors.textMuted, fontSize: '12px' }}>{item.invitedAt ? new Date(item.invitedAt).toLocaleString('zh-CN') : '邀请关系已建立'}</Text>
          </View>
          <Text style={{ color: item.rewarded ? colors.primary : colors.textMuted, fontSize: '12px' }}>{item.rewarded ? '奖励已到账' : '已邀请'}</Text>
        </View>
      ))}
    </View>
  </View>;
}
