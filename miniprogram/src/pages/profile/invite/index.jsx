import React, { useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAuth } from '../../../context/AuthContext';
import { userAPI } from '../../../services/api';
import { colors, radius, spacing } from '../../../theme';
import useNavBar from '../../../hooks/useNavBar';
import inviteShareCover from '../../../assets/invite-share-cover.png';
import { formatChineseDateTime } from '../../../utils/date';

export default function InvitePage() {
  const familyMode = Taro.getCurrentInstance().router?.params?.from === 'family';
  const { user } = useAuth();
  const { statusBarHeight, navBarHeight } = useNavBar();
  const goBack = () => Taro.navigateBack({ delta: 1 }).catch(() => Taro.switchTab({ url: '/pages/profile/index/index' }));
  const [code, setCode] = useState(user?.referralCode || '');
  const [invitees, setInvitees] = useState([]);
  const [reward, setReward] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadReferrals = () => {
    setLoading(true);
    setError('');
    userAPI.referrals().then((res) => {
      if (!res?.success) return;
      setCode(res.data?.referralCode || '');
      setInvitees(Array.isArray(res.data?.invitees) ? res.data.invitees : []);
      setReward(res.data?.reward || null);
    }).catch((err) => {
      setError(err?.message || '邀请记录加载失败');
    }).finally(() => setLoading(false));
  };
  Taro.useDidShow(loadReferrals);
  Taro.useShareAppMessage(() => ({
    title: familyMode ? '邀请你建立自己的健康档案' : '邀请你一起关注健康',
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
    <View style={{ padding: `${statusBarHeight}px ${spacing.lg}px 28px`, backgroundColor: colors.primary, textAlign: 'center' }}>
      <View style={{ position: 'relative', height: `${navBarHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <View onClick={goBack} ariaRole="button" ariaLabel="返回" style={{ position: 'absolute', left: 0, top: 0, minWidth: '64px', height: `${navBarHeight}px`, minHeight: '44px', display: 'flex', alignItems: 'center', color: '#fff', fontSize: '15px' }}><Text>‹ 返回</Text></View>
        <Text style={{ display: 'block', color: '#fff', fontSize: '22px', fontWeight: 800 }}>{familyMode ? '邀请家人建档' : '邀请好友'}</Text>
      </View>
      <Text style={{ display: 'block', color: 'rgba(255,255,255,.82)', fontSize: '14px', marginTop: '10px' }}>一起分享健康理念</Text>
    </View>
    <View style={{ margin: `${spacing.lg}px`, padding: '28px 22px', backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, textAlign: 'center' }}>
      <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>{familyMode ? '邀请成年家人自行建档' : '把健康理念分享给身边的人'}</Text>
      <Text style={{ display: 'block', marginTop: '8px', fontSize: '14px', lineHeight: '22px', color: colors.textSecondary }}>{familyMode ? '对方登录并完成本人建档后，您可在家庭成员页搜索其手机号，发送关联邀请；对方接受后才能关联。' : '健康可控，人生方可从容。'}</Text>
      {reward?.enabled && <View style={{ marginTop: '16px', padding: '12px 14px', backgroundColor: '#F1F7F4', borderRadius: `${radius.sm}px`, textAlign: 'left' }}>
        <Text style={{ display: 'block', color: colors.primary, fontSize: '13px', fontWeight: 700 }}>邀请奖励说明</Text>
        <Text style={{ display: 'block', marginTop: '4px', color: colors.textSecondary, fontSize: '12px', lineHeight: '19px' }}>好友完成健康问卷后，您可获 ¥{reward.inviterAmount} 健康基金，好友可获 ¥{reward.inviteeAmount}；奖励将自动到账并发送系统通知。</Text>
      </View>}
      <Button openType="share" disabled={!code} style={{ marginTop: '24px', backgroundColor: colors.primary, color: '#fff', border: 'none', borderRadius: `${radius.full}px`, fontSize: '16px', fontWeight: 700 }}>{familyMode ? '发送建档邀请' : '邀请好友'}</Button>
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
          <View style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
            <Text style={{ display: 'block', color: colors.textPrimary, fontSize: '14px', fontWeight: 600 }}>{item.name || '好友'}</Text>
            <Text style={{ display: 'block', marginTop: '5px', color: colors.textMuted, fontSize: '12px' }}>{formatChineseDateTime(item.invitedAt) || '邀请关系已建立'}</Text>
          </View>
          <View style={{ flexShrink: 0, maxWidth: '122px' }}>
            <Text style={{ display: 'block', color: item.rewarded ? colors.primary : colors.textMuted, fontSize: '12px', textAlign: 'right' }}>{item.rewarded ? '奖励已到账' : (reward?.enabled ? '待完成健康问卷' : '已邀请')}</Text>
            {!item.rewarded && reward?.enabled && <Text style={{ display: 'block', marginTop: '3px', color: colors.textMuted, fontSize: '10px', textAlign: 'right' }}>完成后自动到账</Text>}
          </View>
        </View>
      ))}
    </View>
  </View>;
}
