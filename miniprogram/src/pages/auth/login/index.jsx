import React, { useState } from 'react';
import { View, Text, Input, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { authAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import Icon from '../../../components/Icon';

export default function LoginPage() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notRegistered, setNotRegistered] = useState(false);

  const afterLoginSuccess = (user) => {
    if (user?.onboardingCompleted) {
      Taro.switchTab({ url: '/pages/home/index' });
    } else {
      Taro.redirectTo({ url: '/pages/onboarding/index' });
    }
  };

  const sendCode = async () => {
    if (!phone || phone.length !== 11) return;
    setError('');
    try {
      setLoading(true);
      const res = await authAPI.sendCode(phone);
      if (res.code) setCode(res.code);
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err.message || '验证码发送失败，请稍后重试');
    } finally { setLoading(false); }
  };

  const handleLogin = async () => {
    if (!phone || !code) return;
    setError('');
    setNotRegistered(false);
    try {
      setLoading(true);
      const res = await authAPI.login(phone, code);
      if (res.success) {
        await login(res.data.user, res.data.token);
        afterLoginSuccess(res.data.user);
      }
    } catch (err) {
      if (err.code === 'NOT_REGISTERED') setNotRegistered(true);
      else setError(err.message || '登录失败，请检查验证码后重试');
    } finally { setLoading(false); }
  };

  // 小程序一键登录：wx.login() 拿 code → 后端 /auth/wechat-mp 换 openid + 签发 JWT
  const wechatLogin = async () => {
    setError('');
    try {
      setLoading(true);
      const res = await authAPI.wechatLogin();
      if (res.success) {
        await login(res.data.user, res.data.token);
        afterLoginSuccess(res.data.user);
      }
    } catch (err) {
      setError(err.message || '微信登录失败，请稍后重试或使用手机号登录');
    } finally { setLoading(false); }
  };

  const demoLogin = async () => {
    setError('');
    try {
      setLoading(true);
      const r1 = await authAPI.sendCode('13800138000');
      const r2 = await authAPI.login('13800138000', r1.code || '123456');
      if (r2.success) {
        await login(r2.data.user, r2.data.token);
        afterLoginSuccess(r2.data.user);
      }
    } catch (err) {
      setError(err.message || '演示登录失败，请稍后重试');
    } finally { setLoading(false); }
  };

  const canSend = phone.length === 11 && countdown === 0;
  const canLogin = phone.length === 11 && code.length === 6;

  return (
    <View style={{ minHeight: '100vh', backgroundColor: '#1A2B24', display: 'flex', flexDirection: 'column' }}>
      {/* Hero */}
      <View style={{ padding: `${spacing.xl}px ${spacing.lg}px`, textAlign: 'center' }}>
        <View style={{
          width: 72, height: 72, borderRadius: 22, background: 'rgba(255,255,255,0.08)',
          margin: '0 auto', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="⚕️" size={32} color="#fff" />
        </View>
        <Text style={{ fontSize: '28px', fontWeight: 800, color: '#fff', letterSpacing: '2px', display: 'block' }}>嘉医汇</Text>
        <Text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '6px', display: 'block' }}>全生命周期健康管理</Text>

        <View style={{
          display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: `${radius.md}px`,
          padding: '12px 0', marginTop: spacing.lg,
        }}>
          {[{ num: '10,000+', label: '服务用户' }, { num: '300+', label: '签约医生' }, { num: '99%', label: '满意度' }].map((it, i) => (
            <View key={i} style={{ flex: 1, textAlign: 'center' }}>
              <Text style={{ fontSize: '17px', fontWeight: 800, color: '#5EC99B', display: 'block' }}>{it.num}</Text>
              <Text style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{it.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 表单卡片 */}
      <View style={{
        flex: 1, backgroundColor: colors.background, borderRadius: '28px 28px 0 0',
        padding: `${spacing.lg}px`,
      }}>
        <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '0 auto 20px' }} />
        <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.textPrimary, display: 'block' }}>手机号登录</Text>
        <Text style={{ fontSize: '13px', color: colors.textMuted, marginBottom: '24px', display: 'block' }}>手机号验证码登录，新用户自动注册</Text>

        <View style={{
          display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: `${radius.md}px`,
          border: `1.5px solid ${colors.border}`, marginBottom: '12px', padding: '0 16px', height: '54px',
        }}>
          <Text style={{ fontSize: '14px', color: colors.textSecondary, fontWeight: 600 }}>+86</Text>
          <View style={{ width: '1px', height: '18px', backgroundColor: colors.border, margin: '0 12px' }} />
          <Input
            style={{ flex: 1, fontSize: '16px', color: colors.textPrimary }}
            type="number"
            maxlength={11}
            placeholder="请输入手机号"
            value={phone}
            onInput={(e) => setPhone(e.detail.value)}
          />
        </View>

        <View style={{
          display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: `${radius.md}px`,
          border: `1.5px solid ${colors.border}`, marginBottom: '12px', padding: '0 16px', height: '54px',
        }}>
          <Input
            style={{ flex: 1, fontSize: '16px', color: colors.textPrimary }}
            type="number"
            maxlength={6}
            placeholder="输入验证码"
            value={code}
            onInput={(e) => setCode(e.detail.value)}
          />
          <View
            style={{
              padding: '7px 12px', borderRadius: `${radius.sm}px`,
              border: `1.5px solid ${canSend ? colors.primary : colors.border}`,
              backgroundColor: canSend ? colors.primary10 : 'transparent',
            }}
            onClick={sendCode}
          >
            <Text style={{ fontSize: '12px', fontWeight: 600, color: canSend ? colors.primary : colors.textMuted }}>
              {countdown > 0 ? `${countdown}s` : '获取验证码'}
            </Text>
          </View>
        </View>

        {!!error && (
          <View style={{ backgroundColor: colors.danger10, borderRadius: `${radius.sm}px`, padding: '8px 12px', marginBottom: '12px' }}>
            <Text style={{ fontSize: '13px', color: colors.danger }}>{error}</Text>
          </View>
        )}

        {notRegistered && (
          <View style={{
            backgroundColor: '#EBF5FB', borderRadius: `${radius.md}px`, border: '1px solid #BEE3F8',
            padding: `${spacing.md}px`, marginBottom: '12px', textAlign: 'center',
          }}>
            <Text style={{ fontSize: '15px', fontWeight: 700, color: '#0077B6', display: 'block', marginBottom: '6px' }}>该手机号暂未开通会员</Text>
            <Text style={{ fontSize: '13px', color: '#4A6558', display: 'block', marginBottom: '14px' }}>
              嘉医汇为邀请制会员服务，如需加入请联系客服申请开通
            </Text>
            <Button
              style={{ backgroundColor: '#0077B6', color: '#fff', fontSize: '14px', borderRadius: `${radius.sm}px` }}
              openType="call"
              onClick={() => Taro.makePhoneCall({ phoneNumber: '17742039618' })}
            >
              拨打客服：17742039618
            </Button>
          </View>
        )}

        <Button
          style={{
            height: '54px', lineHeight: '54px', borderRadius: `${radius.md}px`,
            backgroundColor: '#1A2B24', color: '#fff', fontSize: '16px', fontWeight: 700,
            marginTop: '4px', marginBottom: `${spacing.lg}px`,
            opacity: canLogin ? 1 : 0.35,
          }}
          disabled={!canLogin || loading}
          loading={loading}
          onClick={handleLogin}
        >
          立即登录
        </Button>

        <View style={{ display: 'flex', alignItems: 'center', marginBottom: `${spacing.md}px` }}>
          <View style={{ flex: 1, height: '1px', backgroundColor: colors.borderLight }} />
          <Text style={{ margin: '0 12px', fontSize: '12px', color: colors.textMuted }}>或</Text>
          <View style={{ flex: 1, height: '1px', backgroundColor: colors.borderLight }} />
        </View>

        <View style={{ display: 'flex', gap: `${spacing.sm}px` }}>
          <Button
            style={{
              flex: 1, backgroundColor: '#fff', border: `1.5px solid ${colors.border}`,
              borderRadius: `${radius.md}px`, fontSize: '14px', fontWeight: 600, color: colors.textPrimary,
            }}
            onClick={demoLogin}
            disabled={loading}
          >
            演示体验
          </Button>
          <Button
            style={{
              flex: 1, backgroundColor: '#fff', border: `1.5px solid ${colors.border}`,
              borderRadius: `${radius.md}px`, fontSize: '14px', fontWeight: 600, color: '#07C160',
            }}
            onClick={wechatLogin}
            disabled={loading}
          >
            微信一键登录
          </Button>
        </View>

        <Text style={{ display: 'block', textAlign: 'center', fontSize: '11px', color: colors.textMuted, marginTop: `${spacing.md}px` }}>
          登录代表同意
          <Text
            style={{ color: colors.primary }}
            onClick={() => Taro.navigateTo({ url: '/pages/legal/index?type=terms' })}
          >《用户协议》</Text>
          及
          <Text
            style={{ color: colors.primary }}
            onClick={() => Taro.navigateTo({ url: '/pages/legal/index?type=privacy' })}
          >《隐私政策》</Text>
        </Text>
      </View>
    </View>
  );
}
