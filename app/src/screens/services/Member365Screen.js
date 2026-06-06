import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { member365API } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const FEATURES_INCLUDED = [
  { icon: 'fitness-outline',         color: '#0077B6', text: '健康打卡（饮食/运动/睡眠/饮水/血压）' },
  { icon: 'document-text-outline',   color: '#1E6B50', text: '健康档案（填写既往病史）' },
  { icon: 'cloud-upload-outline',    color: '#7C3AED', text: '体检资料上传与保存' },
];
const FEATURES_UPGRADE = [
  { icon: 'clipboard-outline',       text: '专属健康方案（营养/体检/就医协助）' },
  { icon: 'call-outline',            text: '健管师一对一服务与随访' },
  { icon: 'analytics-outline',       text: '完整健康档案与评估报告' },
  { icon: 'people-outline',          text: '家庭成员健康管理' },
];

const PAYMENT_INFO = {
  wechat: '微信号：jiayi_health（备注：365会员）',
  amount: '¥365 / 年',
};

export default function Member365Screen({ navigation }) {
  const { user } = useAuth();
  const [status, setStatus]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied]   = useState(false);

  useEffect(() => {
    member365API.status().then(res => {
      setStatus(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleApply = async () => {
    Alert.alert(
      '申请 365 会员',
      `请将年费 365 元转账至\n${PAYMENT_INFO.wechat}\n\n备注"365会员"后点击「已转账，提交申请」`,
      [
        { text: '取消', style: 'cancel' },
        { text: '已转账，提交申请', onPress: async () => {
          setApplying(true);
          try {
            const res = await member365API.apply();
            setApplied(true);
            Alert.alert('申请成功', res.message || '已提交，等待客服核实激活（通常在 24 小时内）');
            const r = await member365API.status();
            setStatus(r.data);
          } catch (e) {
            Alert.alert('提交失败', e.message || '请联系客服');
          } finally { setApplying(false); }
        }},
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>365 健康会员</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {/* 状态卡片 */}
          {status?.isRegisteredClient ? (
            <View style={[styles.statusCard, { borderColor: colors.primary }]}>
              <Ionicons name="checkmark-circle" size={36} color={colors.primary} />
              <Text style={styles.statusTitle}>您是嘉医汇正式会员</Text>
              <Text style={styles.statusDesc}>已享有全部服务功能，无需开通 365 会员。</Text>
            </View>
          ) : status?.status === 'active' ? (
            <View style={[styles.statusCard, { borderColor: colors.success }]}>
              <Ionicons name="ribbon" size={36} color={colors.success} />
              <Text style={styles.statusTitle}>365 会员有效中</Text>
              <Text style={styles.statusDesc}>有效至 {status.expiresAt ? new Date(status.expiresAt).toLocaleDateString('zh-CN') : '未知'}</Text>
            </View>
          ) : status?.status === 'pending' ? (
            <View style={[styles.statusCard, { borderColor: colors.warning }]}>
              <Ionicons name="hourglass-outline" size={36} color={colors.warning} />
              <Text style={styles.statusTitle}>申请审核中</Text>
              <Text style={styles.statusDesc}>我们将在 24 小时内核实并激活，请耐心等待。</Text>
            </View>
          ) : (
            /* 未开通 */
            <>
              {/* Slogan */}
              <View style={styles.heroCard}>
                <View style={styles.heroBadge}>
                  <Ionicons name="ribbon-outline" size={16} color={colors.primary} />
                  <Text style={styles.heroBadgeText}>健康优选</Text>
                </View>
                <Text style={styles.heroSlogan}>"每天一块钱，</Text>
                <Text style={styles.heroSlogan}>  开启健康之门"</Text>
                <Text style={styles.heroPrice}>¥<Text style={styles.heroPriceNum}>365</Text> <Text style={styles.heroPriceUnit}>/年</Text></Text>
                <Text style={styles.heroNote}>仅限系统外访客/同行开通</Text>
              </View>

              {/* 包含功能 */}
              <Text style={styles.sectionTitle}>365 会员可使用</Text>
              {FEATURES_INCLUDED.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={[styles.featureIcon, { backgroundColor: f.color + '18' }]}>
                    <Ionicons name={f.icon} size={18} color={f.color} />
                  </View>
                  <Text style={styles.featureText}>{f.text}</Text>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                </View>
              ))}

              {/* 升级功能 */}
              <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>成为正式会员后全部开放</Text>
              {FEATURES_UPGRADE.map((f, i) => (
                <View key={i} style={[styles.featureRow, { opacity: 0.5 }]}>
                  <View style={[styles.featureIcon, { backgroundColor: colors.border }]}>
                    <Ionicons name={f.icon} size={18} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.featureText, { color: colors.textMuted }]}>{f.text}</Text>
                  <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                </View>
              ))}

              {/* 支付信息 */}
              <View style={styles.paymentCard}>
                <Text style={styles.paymentTitle}>支付方式</Text>
                <View style={styles.paymentRow}>
                  <Ionicons name="logo-wechat" size={18} color="#07C160" />
                  <Text style={styles.paymentText}>{PAYMENT_INFO.wechat}</Text>
                </View>
                <Text style={styles.paymentHint}>• 转账后请备注"365会员"</Text>
                <Text style={styles.paymentHint}>• 客服核实后 24 小时内激活</Text>
              </View>

              {/* 申请按钮 */}
              <TouchableOpacity
                style={[styles.applyBtn, applying && { opacity: 0.7 }]}
                onPress={handleApply}
                disabled={applying}
                activeOpacity={0.85}
              >
                {applying
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="ribbon-outline" size={18} color="#fff" />
                      <Text style={styles.applyBtnText}>立即开通 365 会员</Text>
                    </>
                }
              </TouchableOpacity>
            </>
          )}

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  body: { padding: spacing.lg },

  statusCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 2,
    padding: spacing.xl, alignItems: 'center', gap: spacing.sm,
    ...shadow.sm,
  },
  statusTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  statusDesc:  { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },

  heroCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl,
    alignItems: 'center', marginBottom: spacing.lg, ...shadow.sm,
    borderWidth: 1.5, borderColor: colors.primary + '40',
  },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm, backgroundColor: colors.primary + '12', paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full },
  heroBadgeText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  heroSlogan: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, letterSpacing: 0.5 },
  heroPrice:  { fontSize: 22, fontWeight: '700', color: colors.primary, marginTop: spacing.sm },
  heroPriceNum: { fontSize: 38, fontWeight: '900' },
  heroPriceUnit:{ fontSize: 16 },
  heroNote:   { fontSize: 12, color: colors.textMuted, marginTop: 4 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.sm, padding: spacing.sm,
    marginBottom: spacing.xs, ...shadow.xs,
  },
  featureIcon: { width: 36, height: 36, borderRadius: radius.xs, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  featureText: { flex: 1, fontSize: 13, color: colors.textPrimary },

  paymentCard: {
    marginTop: spacing.lg, backgroundColor: '#E8F5EF', borderRadius: radius.md, padding: spacing.md, gap: 6,
  },
  paymentTitle:{ fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  paymentRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paymentText: { fontSize: 13, color: colors.textPrimary },
  paymentHint: { fontSize: 12, color: colors.textSecondary, paddingLeft: 26 },

  applyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: 16, marginTop: spacing.lg, ...shadow.md,
  },
  applyBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
