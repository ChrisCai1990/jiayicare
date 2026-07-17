import React, { useState } from 'react';
import { View, Text, Input, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { userPhoneAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

// 换绑手机号（发验证码 + 提交），对齐 app/src/screens/profile/AccountSecurityScreen.js 的核心链路
export default function AccountSecurityPage() {
  const { user, updateUser } = useAuth();
  const [newPhone, setNewPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const sendCode = async () => {
    if (newPhone.length !== 11) return;
    try {
      await userPhoneAPI.sendChangeCode(newPhone);
      setCountdown(60);
      const timer = setInterval(() => setCountdown((p) => { if (p <= 1) { clearInterval(timer); return 0; } return p - 1; }), 1000);
      Taro.showToast({ title: '验证码已发送', icon: 'none' });
    } catch (err) {
      Taro.showToast({ title: err.message || '发送失败', icon: 'none' });
    }
  };

  const submit = async () => {
    setError('');
    if (newPhone.length !== 11 || code.length !== 6) return;
    setSubmitting(true);
    try {
      const res = await userPhoneAPI.changePhone(newPhone, code);
      if (res.success) {
        updateUser({ phone: newPhone });
        Taro.showToast({ title: '手机号已更新', icon: 'success' });
        setTimeout(() => Taro.navigateBack(), 800);
      } else {
        setError(res.message || '更新失败');
      }
    } catch (err) {
      setError(err.message || '网络错误');
    } finally { setSubmitting(false); }
  };

  const boxStyle = { border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', backgroundColor: '#fff', display: 'flex', alignItems: 'center' };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${spacing.lg}px` }}>
      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.lg}px` }}>
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>当前手机号</Text>
        <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginTop: '4px' }}>{user?.phone || '未绑定'}</Text>
      </View>

      <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.md}px` }}>更换手机号</Text>
      <View style={{ marginBottom: `${spacing.md}px` }}>
        <View style={boxStyle}>
          <Input style={{ flex: 1 }} type="number" maxlength={11} placeholder="新手机号" value={newPhone} onInput={(e) => setNewPhone(e.detail.value)} />
        </View>
      </View>
      <View style={{ marginBottom: `${spacing.md}px` }}>
        <View style={boxStyle}>
          <Input style={{ flex: 1 }} type="number" maxlength={6} placeholder="验证码" value={code} onInput={(e) => setCode(e.detail.value)} />
          <View onClick={sendCode} style={{ padding: '4px 10px' }}>
            <Text style={{ fontSize: '12px', color: colors.primary, fontWeight: 600 }}>{countdown > 0 ? `${countdown}s` : '获取验证码'}</Text>
          </View>
        </View>
      </View>

      {!!error && <Text style={{ fontSize: '13px', color: colors.danger, display: 'block', marginBottom: '10px' }}>{error}</Text>}

      <Button
        style={{ backgroundColor: colors.primary, color: '#fff', borderRadius: `${radius.md}px`, height: '48px', lineHeight: '48px', fontSize: '15px', fontWeight: 700 }}
        loading={submitting}
        onClick={submit}
      >
        确认更换
      </Button>
    </View>
  );
}
