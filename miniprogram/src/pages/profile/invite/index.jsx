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
  const [data, setData] = useState({ total: 0, invitees: [] });
  const code = data.referralCode || user?.referralCode || '';
  useEffect(() => { userAPI.referrals().then(res => res?.success && setData(res.data || {})).catch(() => {}); }, []);
  Taro.useShareAppMessage(() => ({ title: `${user?.name || '好友'}邀请你使用嘉医汇健康管理`, path: `/pages/home/index?invite=${encodeURIComponent(code)}` }));
  return <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
    <View style={{ padding: `${statusBarHeight + 14}px ${spacing.lg}px 24px`, backgroundColor: colors.primary }}>
      <Text style={{ display: 'block', color: '#fff', fontSize: '22px', fontWeight: 800 }}>邀请好友，一起管理健康</Text>
      <Text style={{ display: 'block', color: 'rgba(255,255,255,.8)', fontSize: '13px', marginTop: '8px', lineHeight: '20px' }}>好友通过你的专属分享进入并完成首次建档后，系统会自动记录邀请关系，并按当前活动规则发放健康基金。</Text>
    </View>
    <View style={{ margin: `${spacing.lg}px`, padding: '22px', backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, textAlign: 'center' }}>
      <Text style={{ display: 'block', fontSize: '12px', color: colors.textMuted }}>我的专属邀请码</Text>
      <Text selectable style={{ display: 'block', margin: '10px 0 18px', fontSize: '24px', fontWeight: 800, letterSpacing: '2px', color: colors.textPrimary }}>{code || '加载中'}</Text>
      <Button openType="share" disabled={!code} style={{ backgroundColor: colors.primary, color: '#fff', border: 'none', borderRadius: `${radius.full}px`, fontSize: '15px', fontWeight: 700 }}>发送专属邀请链接</Button>
      <Text style={{ display: 'block', marginTop: '12px', color: colors.textMuted, fontSize: '12px' }}>请让好友直接点击分享卡片进入，系统会自动识别邀请人。</Text>
    </View>
    <View style={{ margin: `0 ${spacing.lg}px`, padding: '18px', backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}` }}>
      <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>邀请记录（{data.total || 0}）</Text>
      {(data.invitees || []).length === 0 ? <Text style={{ display: 'block', marginTop: '16px', fontSize: '13px', color: colors.textMuted }}>还没有好友通过你的链接完成建档</Text> : data.invitees.map(item => <View key={item._id} style={{ padding: '13px 0', borderTop: `1px solid ${colors.borderLight}` }}><Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary }}>{item.name || '好友'}</Text><Text style={{ float: 'right', fontSize: '12px', color: item.rewarded ? colors.success : colors.textMuted }}>{item.rewarded ? '已自动奖励' : '已记录关系'}</Text></View>)}
    </View>
  </View>;
}
