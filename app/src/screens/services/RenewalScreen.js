import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Modal, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { servicesAPI } from '../../services/api';

// ── 续费套餐配置 ──────────────────────────────────────────────────
const PACKAGES = [
  {
    id: 'pkg_1y',
    name: '年度服务包',
    duration: '12 个月',
    price: 3650,
    originalPrice: 5000,
    tag: '最超值',
    tagColor: '#DC3545',
    features: ['专属健管师全年陪伴', '专属家庭医生咨询6次', '就医协助服务9折优惠', 'AI助手无限次使用'],
    highlight: true,
  },
  {
    id: 'pkg_6m',
    name: '半年服务包',
    duration: '6 个月',
    price: 1980,
    originalPrice: 2800,
    tag: '推荐',
    tagColor: '#1E6B50',
    features: ['专属健管师半年陪伴', '专属家庭医生咨询3次', '就医协助服务95折', 'AI助手无限次使用'],
    highlight: false,
  },
  {
    id: 'pkg_3m',
    name: '季度服务包',
    duration: '3 个月',
    price: 1080,
    originalPrice: 1480,
    tag: '',
    tagColor: '',
    features: ['专属健管师季度陪伴', '专属家庭医生咨询1次', 'AI助手无限次使用'],
    highlight: false,
  },
];

function PackageCard({ pkg, selected, onSelect }) {
  const discount = (pkg.price / pkg.originalPrice * 10).toFixed(1);
  return (
    <TouchableOpacity
      style={[styles.pkgCard, selected && styles.pkgCardSelected, pkg.highlight && styles.pkgCardHighlight]}
      onPress={() => onSelect(pkg)}
      activeOpacity={0.85}
    >
      {!!pkg.tag && (
        <View style={[styles.pkgTag, { backgroundColor: pkg.tagColor }]}>
          <Text style={styles.pkgTagText}>{pkg.tag}</Text>
        </View>
      )}

      <View style={styles.pkgTop}>
        <View>
          <Text style={[styles.pkgName, pkg.highlight && { color: colors.white }]}>{pkg.name}</Text>
          <Text style={[styles.pkgDuration, pkg.highlight && { color: 'rgba(255,255,255,0.7)' }]}>{pkg.duration}</Text>
        </View>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioInner} />}
        </View>
      </View>

      <View style={styles.pkgPriceRow}>
        <Text style={[styles.pkgCurrency, pkg.highlight && { color: colors.white }]}>¥</Text>
        <Text style={[styles.pkgPrice, pkg.highlight && { color: colors.white }]}>{pkg.price}</Text>
        <Text style={[styles.pkgOriginal, pkg.highlight && { color: 'rgba(255,255,255,0.5)' }]}>¥{pkg.originalPrice}</Text>
        <View style={[styles.discountBadge, { backgroundColor: pkg.highlight ? 'rgba(255,255,255,0.2)' : colors.danger + '15' }]}>
          <Text style={[styles.discountText, { color: pkg.highlight ? colors.white : colors.danger }]}>{discount}折</Text>
        </View>
      </View>

      <View style={styles.pkgFeatures}>
        {pkg.features.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={13} color={pkg.highlight ? 'rgba(255,255,255,0.8)' : colors.success} />
            <Text style={[styles.featureText, pkg.highlight && { color: 'rgba(255,255,255,0.85)' }]}>{f}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

const PAYMENT_METHODS = [
  { key: 'wechat', label: '微信支付', icon: 'logo-wechat', color: '#07C160' },
  { key: 'alipay', label: '支付宝',   icon: 'card-outline', color: '#1677FF' },
  { key: 'bank',   label: '银行转账', icon: 'business-outline', color: '#6B7280' },
];

// ── 确认弹窗（自带 loading/error 状态）────────────────────────────
function ConfirmModal({ pkg, visible, onClose, onSuccess }) {
  const [payMethod, setPayMethod] = useState('wechat');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const handleSubmit = async () => {
    setErrMsg('');
    setSubmitting(true);
    try {
      const res = await servicesAPI.order(pkg.id, `服务包申请：${pkg.name}（${pkg.duration}）`, payMethod);
      if (res.success) {
        onSuccess(res.data?.orderNo || '');
      } else {
        setErrMsg(res.message || '提交失败，请重试');
      }
    } catch (e) {
      setErrMsg(e.message || '网络错误，请检查连接后重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (!pkg) return null;
  return (
    <Modal visible={!!visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>确认开通</Text>

          <View style={styles.modalSummary}>
            <View style={styles.modalSummaryRow}>
              <Text style={styles.modalSummaryLabel}>套餐</Text>
              <Text style={styles.modalSummaryVal}>{pkg.name}（{pkg.duration}）</Text>
            </View>
            <View style={styles.modalSummaryRow}>
              <Text style={styles.modalSummaryLabel}>原价</Text>
              <Text style={[styles.modalSummaryVal, { textDecorationLine: 'line-through', color: colors.textMuted }]}>¥{pkg.originalPrice}</Text>
            </View>
            <View style={[styles.modalSummaryRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }]}>
              <Text style={[styles.modalSummaryLabel, { fontWeight: '700', color: colors.textPrimary }]}>实付金额</Text>
              <Text style={styles.modalFinalPrice}>¥{pkg.price}</Text>
            </View>
          </View>

          {/* 支付方式 */}
          <Text style={styles.payLabel}>支付方式</Text>
          <View style={styles.payRow}>
            {PAYMENT_METHODS.map(m => (
              <TouchableOpacity
                key={m.key}
                style={[styles.payChip, payMethod === m.key && styles.payChipActive]}
                onPress={() => setPayMethod(m.key)}
                activeOpacity={0.8}
              >
                <Ionicons name={m.icon} size={16} color={payMethod === m.key ? m.color : colors.textMuted} />
                <Text style={[styles.payChipText, payMethod === m.key && { color: colors.textPrimary, fontWeight: '700' }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modalTip}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.modalTipText}>
              提交后，健管师将在 1 个工作日内联系您完成{PAYMENT_METHODS.find(m => m.key === payMethod)?.label}支付及服务激活
            </Text>
          </View>

          {/* 错误提示（直接显示在弹窗内） */}
          {!!errMsg && (
            <View style={styles.modalErrRow}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
              <Text style={styles.modalErrText}>{errMsg}</Text>
            </View>
          )}

          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose} disabled={submitting}>
              <Text style={styles.modalCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalConfirmBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color={colors.white} size="small" />
                : <Text style={styles.modalConfirmText}>提交申请</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function RenewalScreen({ navigation }) {
  const { user } = useAuth();
  const hasService = !!(user?.servicePackage && user?.serviceExpiry);
  // 续约时只展示与当前订阅套餐一致的选项；方案类型用户 or 新开通用户展示全部
  const matchedPackages = PACKAGES.filter(p => p.id === user?.servicePackage);
  const availablePackages = (hasService && matchedPackages.length > 0) ? matchedPackages : PACKAGES;
  const [selected, setSelected]   = useState(availablePackages[0] || PACKAGES[0]);
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess]     = useState(false);
  const [orderNo, setOrderNo]     = useState('');

  const expiry = hasService ? new Date(user.serviceExpiry) : null;
  const daysLeft = expiry ? Math.max(0, Math.ceil((expiry - new Date()) / 86400000)) : 0;
  const isExpired = hasService && daysLeft === 0;
  const isExpiring = hasService && daysLeft > 0 && daysLeft <= 30;

  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.pageTitle}>服务开通</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={styles.successWrap}>
          <View style={styles.successIconRing}>
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
          </View>
          <Text style={styles.successTitle}>申请已提交</Text>
          {!!orderNo && (
            <View style={styles.orderNoRow}>
              <Text style={styles.orderNoLabel}>订单号</Text>
              <Text style={styles.orderNoVal}>{orderNo}</Text>
            </View>
          )}
          <Text style={styles.successDesc}>
            健管师将在 <Text style={{ fontWeight: '700', color: colors.textPrimary }}>1 个工作日内</Text> 与您联系，确认支付并激活 {selected.name}，请保持手机畅通。
          </Text>

          {/* 后续步骤 */}
          <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>接下来的流程</Text>
            {[
              { step: '01', label: '健管师电话联系您', desc: '确认套餐信息' },
              { step: '02', label: '完成支付', desc: '微信 / 支付宝 / 银行转账' },
              { step: '03', label: '服务正式激活', desc: '享受全部专属权益' },
            ].map((s) => (
              <View key={s.step} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{s.step}</Text>
                </View>
                <View>
                  <Text style={styles.stepLabel}>{s.label}</Text>
                  <Text style={styles.stepDesc}>{s.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.successBtnRow}>
            <TouchableOpacity style={styles.successBtnSecondary} onPress={() => navigation.navigate('Orders')} activeOpacity={0.8}>
              <Text style={styles.successBtnSecondaryText}>查看订单</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.successBtn} onPress={() => navigation.navigate('Main')} activeOpacity={0.85}>
              <Text style={styles.successBtnText}>返回首页</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部栏 */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>{hasService ? '服务续费' : '开通服务包'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}>

        {/* 当前状态 */}
        {hasService && (
          <View style={[styles.statusCard, isExpired && styles.statusCardDanger, isExpiring && styles.statusCardWarning]}>
            <Ionicons
              name={isExpired ? 'alert-circle' : isExpiring ? 'time' : 'shield-checkmark'}
              size={20}
              color={isExpired ? colors.danger : isExpiring ? colors.warning : colors.success}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusCardTitle}>{availablePackages[0]?.name || user.servicePackage}</Text>
              <Text style={styles.statusCardSub}>
                {isExpired ? '服务包已到期，续费后立即恢复全部功能'
                  : isExpiring ? `服务包将于 ${daysLeft} 天后到期`
                  : `服务包有效，到期日 ${user.serviceExpiry}`}
              </Text>
            </View>
          </View>
        )}

        {/* 选择套餐 */}
        <Text style={styles.sectionTitle}>选择续费套餐</Text>
        {availablePackages.map(pkg => (
          <PackageCard
            key={pkg.id}
            pkg={pkg}
            selected={selected?.id === pkg.id}
            onSelect={setSelected}
          />
        ))}

        {/* 权益说明 */}
        <View style={styles.benefitCard}>
          <Text style={styles.benefitTitle}>续费专属权益</Text>
          {[
            '续费不中断：在有效期内续费，服务时间自动顺延',
            '老用户优惠：在原套餐基础上额外享 97 折',
            '无缝衔接：续费即激活，不损失已积累的健康数据',
          ].map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <Ionicons name="gift-outline" size={14} color={colors.primary} />
              <Text style={styles.benefitText}>{b}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      {/* 底部按钮 */}
      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.bottomPrice}>¥{selected?.price}</Text>
          <Text style={styles.bottomDuration}>{selected?.name} · {selected?.duration}</Text>
        </View>
        <TouchableOpacity style={styles.renewBtn} onPress={() => setConfirming(true)} activeOpacity={0.85}>
          <Text style={styles.renewBtnText}>{hasService ? '立即续费' : '立即开通'}</Text>
        </TouchableOpacity>
      </View>

      <ConfirmModal
        pkg={selected}
        visible={confirming}
        onClose={() => setConfirming(false)}
        onSuccess={(no) => { setOrderNo(no); setConfirming(false); setSuccess(true); }}
      />

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

  // 状态卡
  statusCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: '#E8F5EF', borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: '#22A06B30',
  },
  statusCardWarning: { backgroundColor: '#FEF3E2', borderColor: colors.warning + '30' },
  statusCardDanger:  { backgroundColor: '#FDECEA', borderColor: colors.danger + '30' },
  statusCardTitle:   { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  statusCardSub:     { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  sectionTitle: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },

  // 套餐卡
  pkgCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 2, borderColor: colors.border,
    padding: spacing.md, position: 'relative', overflow: 'hidden',
  },
  pkgCardSelected: { borderColor: colors.primary },
  pkgCardHighlight: { backgroundColor: '#1A2B24', borderColor: '#1A2B24' },
  pkgTag: {
    position: 'absolute', top: 12, right: 12,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full,
  },
  pkgTagText: { fontSize: 10, color: colors.white, fontWeight: '700' },
  pkgTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  pkgName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  pkgDuration: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  pkgPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: spacing.sm },
  pkgCurrency: { fontSize: 14, fontWeight: '700', color: colors.danger },
  pkgPrice: { fontSize: 28, fontWeight: '800', color: colors.danger },
  pkgOriginal: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'line-through' },
  discountBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  discountText: { fontSize: 11, fontWeight: '700' },
  pkgFeatures: { gap: 6 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featureText: { fontSize: 12, color: colors.textSecondary },

  // 权益说明
  benefitCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  benefitTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 6 },
  benefitText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 18 },

  // 底部栏
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md, paddingBottom: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 8,
  },
  bottomPrice: { fontSize: 22, fontWeight: '800', color: colors.danger },
  bottomDuration: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  renewBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingHorizontal: spacing.xl, paddingVertical: 14,
  },
  renewBtnText: { fontSize: 15, color: colors.white, fontWeight: '700' },

  // 确认弹窗
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl + 8,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginTop: 12, marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.lg },
  modalSummary: {
    backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  modalSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  modalSummaryLabel: { fontSize: 13, color: colors.textSecondary },
  modalSummaryVal: { fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  modalFinalPrice: { fontSize: 20, fontWeight: '800', color: colors.danger },
  modalTip: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: spacing.lg },
  modalTipText: { flex: 1, fontSize: 11, color: colors.textMuted, lineHeight: 17 },
  modalErrRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FDECEA', borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm },
  modalErrText: { flex: 1, fontSize: 12, color: colors.danger, lineHeight: 17 },
  modalBtns: { flexDirection: 'row', gap: spacing.sm },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  modalConfirmBtn: {
    flex: 2, paddingVertical: 14, borderRadius: radius.md,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  modalConfirmText: { fontSize: 15, color: colors.white, fontWeight: '700' },

  // 支付方式
  payLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.sm },
  payRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  payChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 10,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.background,
  },
  payChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '08' },
  payChipText: { fontSize: 12, color: colors.textMuted },

  // 成功页
  successWrap: { flexGrow: 1, alignItems: 'center', padding: spacing.lg, paddingTop: spacing.xl },
  successIconRing: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#E8F5EF', alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  orderNoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.background, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 8, marginBottom: spacing.md,
  },
  orderNoLabel: { fontSize: 12, color: colors.textMuted },
  orderNoVal: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, letterSpacing: 1 },
  successDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  stepsCard: {
    width: '100%', backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
    marginBottom: spacing.xl, gap: spacing.md,
  },
  stepsTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNumText: { fontSize: 11, fontWeight: '800', color: colors.white },
  stepLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  stepDesc: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  successBtnRow: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  successBtnSecondary: {
    flex: 1, paddingVertical: 14, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center',
  },
  successBtnSecondaryText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  successBtn: {
    flex: 1, backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  successBtnText: { fontSize: 14, color: colors.white, fontWeight: '700' },

  toast: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: radius.full,
  },
  toastText: { fontSize: 14, color: colors.white },
});
