import React, { useState } from 'react';
import { View, Text, Button, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { userAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import useNavBar from '../../../hooks/useNavBar';

export default function LocationPage() {
  const { statusBarHeight } = useNavBar();
  const { user, updateUser } = useAuth();
  const saved = user?.residence || {};
  const [region, setRegion] = useState(saved.province ? [saved.province, saved.city, saved.district].filter(Boolean) : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (region.length < 2) return setError('请选择常住所在地');
    setSaving(true); setError('');
    try {
      const res = await userAPI.updateMe({ residence: { province: region[0], city: region[1], district: region[2] || '' } });
      updateUser(res.data); Taro.switchTab({ url: '/pages/home/index' });
    } catch (err) { setError(err.message || '保存失败，请重试'); } finally { setSaving(false); }
  };
  return <View style={{ minHeight: '100vh', backgroundColor: colors.background, paddingTop: `${statusBarHeight}px` }}><View style={{ padding: `${spacing.xl}px ${spacing.lg}px` }}>
    <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.textPrimary, display: 'block' }}>请选择常住所在地</Text>
    <Text style={{ fontSize: '13px', color: colors.textSecondary, marginTop: '8px', display: 'block' }}>便于健康团队了解您所在城市，并匹配本地服务。我们不会读取手机定位。</Text>
    <Picker mode="region" value={region} onChange={(e) => { setRegion(e.detail.value || []); setError(''); }}><View style={{ marginTop: `${spacing.xl}px`, padding: '16px', backgroundColor: colors.surface, border: `1.5px solid ${colors.border}`, borderRadius: `${radius.md}px` }}><Text style={{ color: region.length ? colors.textPrimary : colors.textMuted }}>{region.length ? region.join(' ') : '点击选择省 / 市 / 区'}</Text></View></Picker>
    {!!error && <Text style={{ color: colors.danger, fontSize: '13px', marginTop: '10px', display: 'block' }}>{error}</Text>}
    <Button loading={saving} disabled={saving || region.length < 2} onClick={save} style={{ marginTop: `${spacing.xl}px`, backgroundColor: colors.primary, color: '#fff', borderRadius: `${radius.md}px` }}>保存并进入</Button>
  </View></View>;
}
