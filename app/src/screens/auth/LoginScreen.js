import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const { height: SCREEN_H } = Dimensions.get('window');

// 微信 OAuth 配置（需在微信开放平台申请）
const WECHAT_APPID = process.env.EXPO_PUBLIC_WECHAT_APPID || '';
const REDIRECT_URI = encodeURIComponent(
  (typeof window !== 'undefined' ? window.location.origin : 'https://jiayicare.vercel.app') + '/auth/wechat/callback'
);
// 判断是否在微信浏览器内
const isInWechat = typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent);

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);

  // 检测微信 OAuth 回调（URL 中含 ?code=）
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const params = new URLSearchParams(window.location.search);
    const wxCode = params.get('code');
    const wxState = params.get('state');
    if (!wxCode || wxState !== 'jy_wechat') return;

    // 清除 URL 中的 code 参数（避免刷新重复触发）
    window.history.replaceState({}, '', window.location.pathname);

    setLoading(true);
    authAPI.wechatLogin(wxCode)
      .then(res => { if (res.success) login(res.data.user, res.data.token); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sendCode = async () => {
    if (!phone || phone.length < 11) return;
    setError('');
    try {
      setLoading(true);
      const res = await authAPI.sendCode(phone);
      if (res.code) setCode(res.code);
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown(prev => { if (prev <= 1) { clearInterval(timer); return 0; } return prev - 1; });
      }, 1000);
    } catch (err) {
      setError(err.message || '验证码发送失败，请稍后重试');
    } finally { setLoading(false); }
  };

  const handleLogin = async () => {
    if (!phone || !code) return;
    setError('');
    try {
      setLoading(true);
      const res = await authAPI.login(phone, code);
      if (res.success) await login(res.data.user, res.data.token);
    } catch (err) {
      setError(err.message || '登录失败，请检查验证码后重试');
    } finally { setLoading(false); }
  };

  const demoLogin = async () => {
    setError('');
    try {
      setLoading(true);
      const r1 = await authAPI.sendCode('13800138000');
      const r2 = await authAPI.login('13800138000', r1.code || '123456');
      if (r2.success) await login(r2.data.user, r2.data.token);
    } catch (err) {
      setError(err.message || '演示登录失败，请稍后重试');
    } finally { setLoading(false); }
  };

  const canSend = phone.length === 11 && countdown === 0;
  const canLogin = phone.length === 11 && code.length === 6;

  return (
    <SafeAreaView style={styles.container}>

      {/* ── 顶部 Hero ──────────────────────────────────────────────── */}
      <View style={styles.heroArea}>
        {/* 背景装饰：右上角淡光晕 */}
        <View style={styles.glowDot} />

        <View style={styles.logoBlock}>
          {/* 品牌标志 */}
          <View style={styles.logoMark}>
            <Ionicons name="medical" size={28} color="#5EC99B" />
          </View>
          <Text style={styles.brandName}>嘉医管家</Text>
          <Text style={styles.brandSlogan}>您的私人家庭医生服务平台</Text>
        </View>

        {/* 底部数据背书行 */}
        <View style={styles.trustRow}>
          {[
            { num: '10,000+', label: '服务用户' },
            { num: '300+',    label: '签约医生' },
            { num: '99%',     label: '满意度' },
          ].map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={styles.trustDivider} />}
              <View style={styles.trustItem}>
                <Text style={styles.trustNum}>{item.num}</Text>
                <Text style={styles.trustLabel}>{item.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      {/* ── 表单区域 ───────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.formWrapper}
      >
        <View style={styles.formCard}>
          {/* 顶部圆角拉手 */}
          <View style={styles.pullHandle} />

          <Text style={styles.formTitle}>手机号登录</Text>
          <Text style={styles.formSubtitle}>新用户自动注册，无需等待</Text>

          {/* 手机号输入框 */}
          <View style={[styles.field, phoneFocused && styles.fieldFocused]}>
            <Text style={styles.prefixText}>CN +86</Text>
            <View style={styles.fieldDivider} />
            <TextInput
              style={styles.fieldInput}
              placeholder="请输入手机号"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={11}
              value={phone}
              onChangeText={setPhone}
              onFocus={() => setPhoneFocused(true)}
              onBlur={() => setPhoneFocused(false)}
            />
          </View>

          {/* 验证码输入框 */}
          <View style={[styles.field, codeFocused && styles.fieldFocused]}>
            <Ionicons name="shield-outline" size={17} color={colors.textMuted} style={{ marginRight: 10 }} />
            <TextInput
              style={[styles.fieldInput, { flex: 1 }]}
              placeholder="输入验证码"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              onFocus={() => setCodeFocused(true)}
              onBlur={() => setCodeFocused(false)}
            />
            <TouchableOpacity
              style={[styles.codeBtn, canSend && styles.codeBtnActive]}
              onPress={sendCode}
              disabled={!canSend || loading}
            >
              <Text style={[styles.codeBtnText, canSend && styles.codeBtnTextActive]}>
                {countdown > 0 ? `${countdown}s` : '获取验证码'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 错误提示 */}
          {!!error && (
            <View style={styles.errorWrap}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* 登录按钮 */}
          <TouchableOpacity
            style={[styles.loginBtn, !canLogin && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={!canLogin || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.loginBtnText}>立即登录</Text>
            }
          </TouchableOpacity>

          {/* 分隔线 */}
          <View style={styles.divRow}>
            <View style={styles.divLine} />
            <Text style={styles.divText}>或</Text>
            <View style={styles.divLine} />
          </View>

          {/* 其他登录方式 */}
          <View style={styles.altRow}>
            {/* 演示一键登录 */}
            <TouchableOpacity style={[styles.altBtn, { flex: 1 }]} onPress={demoLogin} disabled={loading} activeOpacity={0.8}>
              <Ionicons name="flash" size={15} color={colors.primary} />
              <Text style={styles.altBtnText}>演示体验</Text>
            </TouchableOpacity>

            {/* 微信登录（仅 web 且配置了 AppID 时显示） */}
            {Platform.OS === 'web' && WECHAT_APPID ? (
              <TouchableOpacity
                style={[styles.altBtn, { flex: 1 }]}
                onPress={() => {
                  const scope = isInWechat ? 'snsapi_userinfo' : 'snsapi_login';
                  const baseUrl = isInWechat
                    ? 'https://open.weixin.qq.com/connect/oauth2/authorize'
                    : 'https://open.weixin.qq.com/connect/qrconnect';
                  window.location.href = `${baseUrl}?appid=${WECHAT_APPID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=jy_wechat#wechat_redirect`;
                }}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-wechat" size={16} color="#07C160" />
                <Text style={styles.altBtnText}>微信登录</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.agreement}>
            登录代表同意{' '}
            <Text style={styles.agreeLink} onPress={() => navigation.navigate('Legal', { type: 'terms' })}>《用户协议》</Text>
            {' '}及{' '}
            <Text style={styles.agreeLink} onPress={() => navigation.navigate('Legal', { type: 'privacy' })}>《隐私政策》</Text>
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A2B24' },

  // ── Hero 区域
  heroArea: {
    height: SCREEN_H * 0.38,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: '#1A2B24',
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },
  glowDot: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(30,107,80,0.18)',
    top: -80, right: -80,
  },
  logoBlock: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  logoMark: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  brandName: {
    fontSize: 28, fontWeight: '800', color: '#FFFFFF',
    letterSpacing: 2, marginBottom: 6,
  },
  brandSlogan: { fontSize: 13, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.3 },

  // 数据背书行
  trustRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 12,
    marginBottom: 4,
  },
  trustItem: { flex: 1, alignItems: 'center' },
  trustNum: { fontSize: 17, fontWeight: '800', color: '#5EC99B', letterSpacing: -0.3 },
  trustLabel: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2, fontWeight: '500' },
  trustDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 4 },

  // ── 表单卡片
  formWrapper: { flex: 1 },
  formCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  pullHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: 20,
  },
  formTitle: {
    fontSize: 22, fontWeight: '800', color: colors.textPrimary,
    marginBottom: 4, letterSpacing: -0.4,
  },
  formSubtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 24 },

  // 输入框
  field: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
    marginBottom: spacing.sm + 4,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  fieldFocused: {
    borderColor: colors.primary,
    ...shadow.xs,
  },
  prefixText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  fieldDivider: { width: 1, height: 18, backgroundColor: colors.border, marginHorizontal: 12 },
  fieldInput: { flex: 1, fontSize: 16, color: colors.textPrimary, height: 54 },

  codeBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.border,
  },
  codeBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary10 },
  codeBtnText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  codeBtnTextActive: { color: colors.primary },

  // 登录按钮
  loginBtn: {
    height: 54, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1A2B24',
    marginTop: 4, marginBottom: spacing.lg,
  },
  loginBtnDisabled: { opacity: 0.35 },
  errorWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.danger + '12', borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 8, marginBottom: spacing.sm,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.danger },
  loginBtnText: { color: colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  // 分隔线
  divRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  divLine: { flex: 1, height: 1, backgroundColor: colors.borderLight },
  divText: { marginHorizontal: 12, fontSize: 12, color: colors.textMuted },

  // 其他登录方式
  altRow: { flexDirection: 'row', gap: spacing.sm },
  altBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
    paddingVertical: 13, gap: 7,
  },
  altBtnText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },

  agreement: { textAlign: 'center', fontSize: 11, color: colors.textMuted, marginTop: spacing.md },
  agreeLink: { color: colors.primary, fontWeight: '500' },
});
