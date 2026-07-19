import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { userAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// 首次登录最小化建档：姓名+身份证号+联系电话，性别/出生日期由身份证号自动解析。
// 其余健康信息（既往史/生活方式/心理健康等）交给问卷库分批推送采集，此处不重复询问。

export default function OnboardingScreen({ navigation }) {
  const { updateUser } = useAuth();
  const [name, setName] = useState('');
  const [idType, setIdType] = useState('idCard'); // idCard 身份证 | passport 护照
  const [idNumber, setIdNumber] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const canSubmit = name.trim() && contactPhone.trim() && !submitting;

  const submit = async () => {
    setErrorMsg('');
    if (!name.trim()) { setErrorMsg('请填写姓名'); return; }
    if (!contactPhone.trim()) { setErrorMsg('请填写联系电话'); return; }
    setSubmitting(true);
    try {
      const res = await userAPI.onboarding({
        name: name.trim(),
        idNumber: idNumber.trim() || undefined,
        idType,
        contactPhone: contactPhone.trim(),
      });
      if (res.success) {
        updateUser({ ...res.data.user, onboardingCompleted: true });
        navigation.replace('Main');
      } else {
        setErrorMsg(res.message || '提交失败，请重试');
      }
    } catch (err) {
      setErrorMsg(err.message || '网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.stepIconWrap}>
          <View style={styles.stepIcon}>
            <Ionicons name="person-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.headerTitle}>完善基础信息</Text>
          <Text style={styles.headerSubtitle}>用于建立您的专属健康档案</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>姓名</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              placeholder="请输入您的姓名"
              value={name}
              onChangeText={setName}
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>证件类型</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {[{ key: 'idCard', label: '身份证' }, { key: 'passport', label: '护照' }].map(t => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setIdType(t.key)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center',
                  borderWidth: 1.5, borderColor: idType === t.key ? colors.primary : colors.border,
                  backgroundColor: idType === t.key ? colors.primary + '0D' : colors.surface,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: idType === t.key ? '700' : '500', color: idType === t.key ? colors.primary : colors.textMuted }}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>{idType === 'passport' ? '护照号' : '身份证号'}</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              placeholder={idType === 'passport' ? '请输入护照号' : '用于自动识别性别与出生日期'}
              value={idNumber}
              onChangeText={setIdNumber}
              maxLength={idType === 'passport' ? 20 : 18}
              autoCapitalize="characters"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        <View style={[styles.formGroup, { marginBottom: spacing.xxl }]}>
          <Text style={styles.formLabel}>联系电话</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              placeholder="用于健康团队与您联系"
              keyboardType="phone-pad"
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        {!!errorMsg && (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        <View style={styles.infoBox}>
          <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
          <Text style={styles.infoText}>完成后，您的健康团队会推送健康档案问卷，帮助建立更完整的健康画像。</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.nextBtn, !canSubmit && styles.nextBtnDisabled]} onPress={submit} disabled={!canSubmit}>
          {submitting
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.nextBtnText}>进入我的健康管家 →</Text>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  stepIconWrap: { alignItems: 'center', paddingVertical: spacing.lg },
  stepIcon: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: colors.primary + '10',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  formGroup: { marginBottom: spacing.lg },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.3 },
  inputBox: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.sm, borderWidth: 1.5, borderColor: colors.border },
  input: { fontSize: 15, color: colors.textPrimary },
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.danger + '10', padding: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.md,
  },
  errorText: { fontSize: 13, color: colors.danger, flex: 1 },
  infoBox: {
    flexDirection: 'row', gap: spacing.xs, width: '100%',
    backgroundColor: colors.primary + '10', borderRadius: radius.sm,
    padding: spacing.sm, marginTop: spacing.md, alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 12, color: colors.primary, lineHeight: 18 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: radius.md, height: 52, gap: spacing.xs,
    ...shadow.md,
  },
  nextBtnDisabled: { backgroundColor: colors.textMuted },
  nextBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
