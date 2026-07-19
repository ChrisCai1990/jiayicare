import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Modal, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { servicesAPI, messagesAPI } from '../../services/api';

// ── 服务套餐配置（仅无服务的新用户自主开通用；已有服务的续约走健管师推送+消息页支付，不用这套）──
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

// ── 确认弹窗（自带 loading/error 状态 + 健康基金/优惠券抵扣）────────
function ConfirmModal({ pkg, visible, onClose, onSuccess, isRenewal }) {
  const { user } = useAuth();
  const [payMethod, setPayMethod] = useState('wechat');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const fundBalance = user?.healthFund?.total || 0;
  const [useFund, setUseFund] = useState(false);
  const [fundAmountInput, setFundAmountInput] = useState('');
  const [coupons, setCoupons] = useState([]);
  const [couponId, setCouponId] = useState(null);

  useEffect(() => {
    if (!visible) return;
    servicesAPI.coupons().then(res => {
      if (res.success) setCoupons(res.data || []);
    }).catch(() => {});
  }, [visible]);

  if (!pkg) return null;

  const selectedCoupon = coupons.find(c => c._id === couponId) || null;
  const couponDiscount = selectedCoupon
    ? Math.min(
        selectedCoupon.type === 'amount' ? selectedCoupon.value : Math.round(pkg.price * (100 - selectedCoupon.value)) / 100,
        pkg.price
      )
    : 0;
  const priceAfterCoupon = Math.max(0, Math.round((pkg.price - couponDiscount) * 100) / 100);
  const fundApplied = useFund ? Math.min(Number(fundAmountInput) || 0, fundBalance, priceAfterCoupon) : 0;
  const finalPrice = Math.max(0, Math.round((priceAfterCoupon - fundApplied) * 100) / 100);

  const handleSubmit = async () => {
    setErrMsg('');
    setSubmitting(true);
    try {
      const noteLabel = isRenewal ? `续约申请：${pkg.name}（${pkg.duration}）` : `服务包申请：${pkg.name}（${pkg.duration}）`;
      const res = await servicesAPI.order(pkg.id, noteLabel, payMethod, fundApplied, couponId);
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

  return (
    <Modal visible={!!visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{isRenewal ? '确认续约' : '确认开通'}</Text>

          <View style={styles.modalSummary}>
            <View style={styles.modalSummaryRow}>
              <Text style={styles.modalSummaryLabel}>套餐</Text>
              <Text style={styles.modalSummaryVal}>{pkg.name}（{pkg.duration}）</Text>
            </View>
            <View style={styles.modalSummaryRow}>
              <Text style={styles.modalSummaryLabel}>原价</Text>
              <Text style={[styles.modalSummaryVal, { textDecorationLine: 'line-through', color: colors.textMuted }]}>¥{pkg.originalPrice}</Text>
            </View>
            {couponDiscount > 0 && (
              <View style={styles.modalSummaryRow}>
                <Text style={styles.modalSummaryLabel}>优惠券抵扣</Text>
                <Text style={[styles.modalSummaryVal, { color: colors.danger }]}>-¥{couponDiscount}</Text>
              </View>
            )}
            {fundApplied > 0 && (
              <View style={styles.modalSummaryRow}>
                <Text style={styles.modalSummaryLabel}>健康基金抵扣</Text>
                <Text style={[styles.modalSummaryVal, { color: colors.danger }]}>-¥{fundApplied}</Text>
              </View>
            )}
            <View style={[styles.modalSummaryRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }]}>
              <Text style={[styles.modalSummaryLabel, { fontWeight: '700', color: colors.textPrimary }]}>实付金额</Text>
              <Text style={styles.modalFinalPrice}>¥{finalPrice}</Text>
            </View>
          </View>

          {/* 优惠券 */}
          {coupons.length > 0 && (
            <>
              <Text style={styles.payLabel}>优惠券</Text>
              <View style={{ gap: 8, marginBottom: spacing.md }}>
                <TouchableOpacity
                  style={[styles.payChip, { flex: 0 }, !couponId && styles.payChipActive]}
                  onPress={() => setCouponId(null)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.payChipText, !couponId && { color: colors.textPrimary, fontWeight: '700' }]}>不使用优惠券</Text>
                </TouchableOpacity>
                {coupons.map(c => (
                  <TouchableOpacity
                    key={c._id}
                    style={[styles.payChip, { flex: 0 }, couponId === c._id && styles.payChipActive]}
                    onPress={() => setCouponId(c._id)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.payChipText, couponId === c._id && { color: colors.textPrimary, fontWeight: '700' }]}>
                      {(c.title || (c.type === 'amount' ? `¥${c.value}抵用券` : `${c.value / 10}折优惠券`))}{c.minSpend > 0 ? `（满¥${c.minSpend}可用）` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* 健康基金抵扣 */}
          {fundBalance > 0 && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                <Text style={styles.payLabel}>健康基金抵扣（余额 ¥{fundBalance.toFixed(2)}）</Text>
                <TouchableOpacity
                  onPress={() => {
                    const next = !useFund;
                    setUseFund(next);
                    if (next) setFundAmountInput(String(Math.min(fundBalance, priceAfterCoupon)));
                  }}
                  style={[styles.payChip, { flex: 0, paddingHorizontal: 12 }, useFund && styles.payChipActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.payChipText, useFund && { color: colors.textPrimary, fontWeight: '700' }]}>{useFund ? '已启用' : '使用基金'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

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
// 已有服务的用户：续约都由健管师在商城选好产品后推送，客户只需在「消息」里勾选支付，
// 这里只展示当前所属计划状态 + 引导去联系健管师，不再自己拼商城套餐名称乱猜。
// 无服务的新用户：仍可在此自主选 4 个通用服务包开通（这不是续约场景）。
export default function RenewalScreen({ navigation }) {
  const { user } = useAuth();
  const hasService = !!(user?.servicePackage && user?.serviceExpiry);
  const [selected, setSelected]   = useState(PACKAGES[0]);
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess]     = useState(false);
  const [orderNo, setOrderNo]     = useState('');
  const [intentSending, setIntentSending] = useState(false);

  const handleContactManager = async () => {
    setIntentSending(true);
    try {
      const content = `【续约意向】我希望续约当前服务方案（${user?.servicePackage || ''}，到期日：${user?.serviceExpiry}），请协助安排续约。`;
      await messagesAPI.send('manager', content);
      Alert.alert('已发送', '续约意向已通知健管师，请留意「消息」页面的产品推送并完成支付。', [
        { text: '去看消息', onPress: () => navigation.navigate('Messages') },
        { text: '好的', style: 'cancel' },
      ]);
    } catch (e) {
      Alert.alert('发送失败', e.message || '网络错误，请稍后重试');
    } finally {
      setIntentSending(false);
    }
  };

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
            健管师将在 <Text style={{ fontWeight: '700', color: colors.textPrimary }}>1 个工作日内</Text> 与您联系，确认支付并激活 {selected?.name}，请保持手机畅通。
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

  // 已有服务的用户：纯状态展示 + 联系健管师，不再自主选套餐
  if (hasService) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.pageTitle}>服务续费</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}>
          <View style={[styles.statusCard, isExpired && styles.statusCardDanger, isExpiring && styles.statusCardWarning]}>
            <Ionicons
              name={isExpired ? 'alert-circle' : isExpiring ? 'time' : 'shield-checkmark'}
              size={20}
              color={isExpired ? colors.danger : isExpiring ? colors.warning : colors.success}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusCardTitle}>{user.servicePackage}</Text>
              <Text style={styles.statusCardSub}>
                {isExpired ? '服务包已到期，续费后立即恢复全部功能'
                  : isExpiring ? `服务包将于 ${daysLeft} 天后到期`
                  : `服务包有效，到期日 ${user.serviceExpiry}`}
              </Text>
            </View>
          </View>

          <View style={{ backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>续约由健管师为您安排</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 20 }}>
              点击下方按钮通知健管师，健管师确认续约方案后会以消息形式推送给您，届时可在「消息」页面直接勾选支付（支持健康基金和优惠券抵扣）。
            </Text>
          </View>

          <TouchableOpacity
            style={{ backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onPress={() => navigation.navigate('Messages')}
            activeOpacity={0.85}
          >
            <Ionicons name="chatbubbles-outline" size={16} color={colors.primary} />
            <Text style={{ fontSize: 14, color: colors.primary, fontWeight: '700' }}>查看消息里的续约推送</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.renewBtn, { flex: 1 }, intentSending && { opacity: 0.6 }]}
            onPress={handleContactManager}
            disabled={intentSending}
            activeOpacity={0.85}
          >
            {intentSending
              ? <ActivityIndicator color={colors.white} size="small" />
              : <Text style={styles.renewBtnText}>联系健管师续约</Text>
            }
          </TouchableOpacity>
        </View>
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
        <Text style={styles.pageTitle}>开通服务包</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}>

        {/* 标准服务包开通 */}
        <View>
          <Text style={styles.sectionTitle}>选择服务套餐</Text>
          {PACKAGES.map(pkg => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              selected={selected?.id === pkg.id}
              onSelect={setSelected}
            />
          ))}
        </View>

        {/* 权益说明 */}
        <View style={styles.benefitCard}>
          <Text style={styles.benefitTitle}>专属权益</Text>
          {[
            '专属健管师全程陪伴管理',
            '专属家庭医生咨询问诊',
            '无缝衔接：开通即激活，全部功能立即可用',
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
          <Text style={styles.renewBtnText}>立即开通</Text>
        </TouchableOpacity>
      </View>

      <ConfirmModal
        pkg={selected}
        visible={confirming}
        isRenewal={false}
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
