import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { userAPI } from '../../services/api';

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

export default function AccountSecurityScreen({ navigation }) {
  const { user, updateUser } = useAuth();

  const [step, setStep]           = useState(0); // 0=info 1=new-phone 2=verify
  const [newPhone, setNewPhone]   = useState('');
  const [code, setCode]           = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading]     = useState(false);
  const [toast, setToast]         = useState('');

  const showToast = (msg, ms = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(''), ms);
  };

  const startCountdown = () => {
    setCountdown(60);
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(t); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(newPhone)) {
      showToast('请输入正确的手机号'); return;
    }
    setLoading(true);
    try {
      const res = await userAPI.sendChangeCode(newPhone);
      if (res.success) {
        showToast('验证码已发送（测试环境固定：123456）', 5000);
        startCountdown();
        setStep(2);
      } else {
        showToast(res.message || '发送失败，请重试');
      }
    } catch (e) {
      showToast(e.message || '网络错误');
    } finally {
      setLoading(false);
    }
  };

  const verifyAndChange = async () => {
    if (!code || code.length < 4) { showToast('请输入验证码'); return; }
    setLoading(true);
    try {
      const res = await userAPI.changePhone(newPhone, code);
      if (res.success) {
        updateUser({ phone: newPhone });
        showToast('手机号更换成功', 2000);
        setTimeout(() => navigation.goBack(), 2000);
      } else {
        showToast(res.message || '验证失败，请重试');
      }
    } catch (e) {
      showToast(e.message || '网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>账号安全</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Toast */}
      {!!toast && (
        <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View>
      )}

      {/* 账号信息 */}
      {step === 0 && (
        <View style={styles.body}>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <View style={styles.infoLeft}>
                <Ionicons name="phone-portrait-outline" size={18} color={colors.primary} />
                <Text style={styles.infoLabel}>绑定手机</Text>
              </View>
              <Text style={styles.infoValue}>{maskPhone(user?.phone)}</Text>
            </View>
            <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.borderLight }]}>
              <View style={styles.infoLeft}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.success} />
                <Text style={styles.infoLabel}>登录方式</Text>
              </View>
              <Text style={styles.infoValue}>手机验证码</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.changeBtn} onPress={() => setStep(1)}>
            <Ionicons name="swap-horizontal-outline" size={18} color={colors.white} />
            <Text style={styles.changeBtnText}>更换手机号</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>更换后需用新手机号登录，请确保新号码可以正常接收短信。</Text>
        </View>
      )}

      {/* Step 1: 输入新手机号 */}
      {step === 1 && (
        <View style={styles.body}>
          <Text style={styles.stepTitle}>输入新手机号</Text>
          <Text style={styles.stepDesc}>请输入要绑定的新手机号，我们将发送验证码确认。</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入新手机号"
            placeholderTextColor={colors.textMuted}
            value={newPhone}
            onChangeText={setNewPhone}
            keyboardType="phone-pad"
            maxLength={11}
          />
          <TouchableOpacity
            style={[styles.changeBtn, loading && { opacity: 0.6 }]}
            onPress={sendCode}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.changeBtnText}>发送验证码</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep(0)} style={styles.cancelLink}>
            <Text style={styles.cancelLinkText}>取消</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 2: 验证码 */}
      {step === 2 && (
        <View style={styles.body}>
          <Text style={styles.stepTitle}>输入验证码</Text>
          <Text style={styles.stepDesc}>验证码已发送至 {maskPhone(newPhone)}</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入6位验证码"
            placeholderTextColor={colors.textMuted}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <View style={styles.resendRow}>
            {countdown > 0
              ? <Text style={styles.countdownText}>{countdown}s 后可重新发送</Text>
              : (
                <TouchableOpacity onPress={() => { setStep(1); }}>
                  <Text style={styles.resendText}>重新发送</Text>
                </TouchableOpacity>
              )
            }
          </View>
          <TouchableOpacity
            style={[styles.changeBtn, loading && { opacity: 0.6 }]}
            onPress={verifyAndChange}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.changeBtnText}>确认更换</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  toast: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    backgroundColor: colors.textPrimary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  toastText: { color: colors.white, fontSize: 13, textAlign: 'center' },
  body: { padding: spacing.lg },
  card: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.lg, overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 15,
  },
  infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoLabel: { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  infoValue: { fontSize: 14, color: colors.textSecondary },
  changeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14,
    marginBottom: spacing.md,
  },
  changeBtnText: { fontSize: 15, color: colors.white, fontWeight: '700' },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 18, textAlign: 'center' },
  stepTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  stepDesc:  { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
  input: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 14,
    fontSize: 16, color: colors.textPrimary, marginBottom: spacing.md,
  },
  resendRow: { alignItems: 'flex-end', marginBottom: spacing.md },
  countdownText: { fontSize: 13, color: colors.textMuted },
  resendText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  cancelLink: { alignItems: 'center', paddingVertical: 10 },
  cancelLinkText: { fontSize: 14, color: colors.textMuted },
});
