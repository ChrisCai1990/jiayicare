import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Modal, TextInput, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow, gradient } from '../../theme';
import { mockServices, mockServiceCategories } from '../../data/mockData';
import { servicesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

function StarRow({ rating }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <Ionicons key={i} name={i <= Math.round(rating) ? 'star' : 'star-outline'} size={11} color="#F39C12" />
      ))}
      <Text style={styles.ratingNum}>{rating}</Text>
    </View>
  );
}

// ── 服务详情弹窗（图文内容）───────────────────────────────────────
function ServiceDetailModal({ item, onClose, onBuy }) {
  if (!item) return null;
  const hasContent = item.description || (item.images && item.images.length > 0);
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { paddingBottom: 0 }]}>
          <View style={styles.modalHandle} />

          {/* 标题行 */}
          <View style={styles.modalServiceRow}>
            <View style={[styles.modalServiceIcon, { backgroundColor: (item.iconColor || '#1E6B50') + '15' }]}>
              <Ionicons name={item.icon || 'star-outline'} size={28} color={item.iconColor || '#1E6B50'} />
            </View>
            <View style={styles.modalServiceInfo}>
              <Text style={styles.modalServiceName} numberOfLines={2}>{item.name}</Text>
              <StarRow rating={item.rating || 5} />
            </View>
          </View>

          {/* 图文内容区 */}
          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            {/* 图片轮播 */}
            {item.images && item.images.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
                {item.images.map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={{ width: 280, height: 180, borderRadius: radius.md, marginRight: spacing.sm }} resizeMode="cover" />
                ))}
              </ScrollView>
            )}

            {/* 描述文字 */}
            {item.description ? (
              <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.md }}>
                {item.description}
              </Text>
            ) : null}

            {/* 特色功能 */}
            {!hasContent && (
              <View style={styles.modalFeatures}>
                {(item.features || []).map((f, i) => (
                  <View key={i} style={styles.modalFeatureChip}>
                    <Ionicons name="checkmark" size={11} color={colors.primary} />
                    <Text style={styles.modalFeatureText}>{f}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* 价格 */}
            <View style={[styles.modalPriceRow, { marginBottom: spacing.lg }]}>
              <Text style={styles.modalPriceLabel}>服务费用</Text>
              <View style={styles.modalPriceRight}>
                {item.price < item.originalPrice && <Text style={styles.modalOriginal}>¥{item.originalPrice}</Text>}
                <Text style={styles.modalPrice}>¥{item.price}</Text>
              </View>
            </View>
          </ScrollView>

          {/* 底部按钮 */}
          <View style={[styles.modalBtns, { paddingVertical: spacing.lg }]}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>返回</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={onBuy} activeOpacity={0.85}>
              <Text style={styles.submitBtnText}>立即预约</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 购买确认弹窗 ────────────────────────────────────────────────────
function PurchaseModal({ item, onClose }) {
  const [note, setNote]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errMsg, setErrMsg]       = useState('');

  if (!item) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrMsg('');
    try {
      const res = await servicesAPI.order(item.id, note.trim());
      if (res.success) {
        setSubmitted(true);
      } else {
        setErrMsg(res.message || '提交失败，请重试');
      }
    } catch (e) {
      setErrMsg(e.message || '网络错误，请检查连接后重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Modal visible animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={52} color={colors.success} />
            </View>
            <Text style={styles.successTitle}>预约申请已提交</Text>
            <Text style={styles.successDesc}>健管师将在 1-2 个工作日内与您联系，请保持手机畅通。</Text>
            <TouchableOpacity style={styles.successBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.successBtnText}>知道了</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />

          <View style={styles.modalServiceRow}>
            <View style={[styles.modalServiceIcon, { backgroundColor: item.iconColor + '15' }]}>
              <Ionicons name={item.icon} size={28} color={item.iconColor} />
            </View>
            <View style={styles.modalServiceInfo}>
              <Text style={styles.modalServiceName} numberOfLines={2}>{item.name}</Text>
              <StarRow rating={item.rating} />
            </View>
          </View>

          {item.servicePrices && item.servicePrices.length > 0 ? (
            <View style={[styles.modalPriceRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
              <Text style={styles.modalPriceLabel}>收费项目</Text>
              {item.servicePrices.map((sp, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>{sp.label}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.danger }}>¥{sp.price}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.modalPriceRow}>
              <Text style={styles.modalPriceLabel}>服务费用</Text>
              <View style={styles.modalPriceRight}>
                {item.price < item.originalPrice && <Text style={styles.modalOriginal}>¥{item.originalPrice}</Text>}
                <Text style={styles.modalPrice}>¥{item.price}</Text>
              </View>
            </View>
          )}

          <View style={styles.modalFeatures}>
            {item.features.map((f, i) => (
              <View key={i} style={styles.modalFeatureChip}>
                <Ionicons name="checkmark" size={11} color={colors.primary} />
                <Text style={styles.modalFeatureText}>{f}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.noteLabel}>备注（可选）</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="如有特殊需求，请在此说明"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
          />

          {!!errMsg && (
            <Text style={styles.errText}>{errMsg}</Text>
          )}

          <View style={styles.hintRow}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.hintText}>提交后，健管师将与您联系确认具体服务安排</Text>
          </View>

          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.submitBtnText}>提交预约</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ServiceCard({ item, onDetail, onBuy }) {
  const discount = Math.round((1 - item.price / item.originalPrice) * 10);
  const hasDiscount = item.price < item.originalPrice;
  return (
    <TouchableOpacity style={styles.serviceCard} activeOpacity={0.85} onPress={() => onDetail(item)}>
      {item.tag ? (
        <View style={[styles.serviceTag, { backgroundColor: item.tagColor }]}>
          <Text style={styles.serviceTagText}>{item.tag}</Text>
        </View>
      ) : null}
      <View style={styles.serviceCardTop}>
        <View style={[styles.serviceIcon, { backgroundColor: item.iconColor + '15' }]}>
          <Ionicons name={item.icon} size={26} color={item.iconColor} />
        </View>
        <View style={styles.serviceInfo}>
          <Text style={styles.serviceName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.serviceSubtitle} numberOfLines={2}>{item.subtitle}</Text>
          <StarRow rating={item.rating} />
          <Text style={styles.reviewCount}>{item.reviewCount}人已购</Text>
        </View>
      </View>

      <View style={styles.featureRow}>
        {item.features.map((f, i) => (
          <View key={i} style={styles.featureChip}>
            <Ionicons name="checkmark" size={10} color={colors.primary} />
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      <View style={styles.serviceCardBottom}>
        <View>
          <View style={styles.priceRow}>
            <Text style={styles.priceCurrency}>¥</Text>
            <Text style={styles.priceVal}>{item.price}</Text>
            {hasDiscount && <Text style={styles.priceOriginal}>¥{item.originalPrice}</Text>}
            {hasDiscount && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>{discount}折</Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity style={styles.buyBtn} onPress={() => onDetail(item)}>
          <Text style={styles.buyBtnText}>立即预约</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function BannerCard({ hasService, isMember, servicePackage, daysLeft, onViewOrders, onActivate }) {
  // 已有服务包 → 显示会员权益
  if (hasService) {
    return (
      <View style={styles.banner}>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTag}>专属会员权益</Text>
          <Text style={styles.bannerTitle} numberOfLines={1}>{servicePackage || '年度服务包'}</Text>
          <Text style={styles.bannerSub}>全场享 9 折 · 剩余 {daysLeft} 天</Text>
          <TouchableOpacity style={styles.bannerBtn} onPress={onViewOrders}>
            <Text style={styles.bannerBtnText}>查看我的订单</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.bannerIllustration}>
          <Ionicons name="shield-checkmark" size={60} color="rgba(255,255,255,0.3)" />
        </View>
      </View>
    );
  }

  // 是会员但暂无服务包 → 不展示开通入口
  if (isMember) return null;

  // 未开通：展示服务包权益介绍 + 开通入口
  return (
    <View style={styles.activateBanner}>
      <View style={styles.activateBannerLeft}>
        <View style={styles.activateIconWrap}>
          <Ionicons name="shield-checkmark-outline" size={28} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.activateTitle}>开通专属服务包</Text>
          <View style={styles.activatePoints}>
            {['专属家庭医生咨询', '健管师全程陪伴', '全年复查提醒', 'AI无限次咨询'].map((p, i) => (
              <View key={i} style={styles.activatePoint}>
                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                <Text style={styles.activatePointText}>{p}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      <TouchableOpacity style={styles.activateBtn} onPress={onActivate} activeOpacity={0.85}>
        <Text style={styles.activateBtnText}>立即开通</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

export default function ServiceMallScreen({ navigation, route }) {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState('全部');
  const [detailService, setDetailService]   = useState(null);   // 详情弹窗
  const [selectedService, setSelectedService] = useState(null); // 购买弹窗
  const [services, setServices]     = useState(mockServices);
  const [categories, setCategories] = useState(mockServiceCategories);
  const [loadingList, setLoadingList] = useState(true);

  const hasService = !!(user?.servicePackage && user?.serviceExpiry);
  const isMember  = !!(user?.memberType) || hasService;
  const expiry   = hasService ? new Date(user.serviceExpiry) : null;
  const daysLeft = expiry ? Math.max(0, Math.ceil((expiry - new Date()) / 86400000)) : 0;

  // 拉取服务目录
  useEffect(() => {
    (async () => {
      try {
        const res = await servicesAPI.list();
        if (res.success && res.data?.services?.length > 0) {
          setServices(res.data.services);
          setCategories(res.data.categories || mockServiceCategories);
        }
      } catch {
        // 网络失败时保留 mockServices
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  const filtered = activeCategory === '全部'
    ? services
    : services.filter(s => s.category === activeCategory);

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.topBar, gradient.header]}>
        <View style={styles.topBarDecor} />
        <View style={styles.topBarRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={styles.topBarCenter}>
            <Text style={styles.pageTitle}>服务商城</Text>
            <Text style={styles.pageSubtitle}>专属健康服务，品质保障</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Banner */}
        <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.md }}>
          <BannerCard
            hasService={hasService}
            isMember={isMember}
            servicePackage={user?.servicePackage}
            daysLeft={daysLeft}
            onViewOrders={() => navigation.navigate('Orders')}
            onActivate={() => navigation.navigate('Renewal')}
          />
        </View>

        {/* Category Tabs */}
        <View style={{ marginTop: spacing.md }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.catChip, activeCategory === cat && styles.catChipActive]}
                onPress={() => setActiveCategory(cat)}
              >
                <Text style={[styles.catChipText, activeCategory === cat && styles.catChipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Services */}
        <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.xl * 2 }}>
          {loadingList ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <>
              <Text style={styles.resultCount}>共 {filtered.length} 个服务</Text>
              {filtered.map(s => (
                <ServiceCard key={s.id} item={s} onDetail={setDetailService} onBuy={setSelectedService} />
              ))}
            </>
          )}
        </View>
      </ScrollView>

      {/* Service Detail Modal */}
      {detailService && (
        <ServiceDetailModal
          item={detailService}
          onClose={() => setDetailService(null)}
          onBuy={() => { setSelectedService(detailService); setDetailService(null); }}
        />
      )}

      {/* Purchase Modal */}
      {selectedService && (
        <PurchaseModal item={selectedService} onClose={() => setSelectedService(null)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg,
    backgroundColor: colors.primary, overflow: 'hidden', position: 'relative',
  },
  topBarDecor: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.05)', top: -70, right: -50,
  },
  topBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topBarCenter: { flex: 1, alignItems: 'center' },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  pageSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  // 已开通会员 Banner
  banner: {
    backgroundColor: colors.primary, borderRadius: radius.xl,
    padding: spacing.lg, flexDirection: 'row', overflow: 'hidden', minHeight: 110,
  },
  bannerContent: { flex: 1 },
  bannerTag: { fontSize: 11, color: 'rgba(255,255,255,0.7)', backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, marginBottom: spacing.xs },
  bannerTitle: { fontSize: 18, fontWeight: '800', color: colors.white },
  bannerSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 3, marginBottom: spacing.sm },
  bannerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full },
  bannerBtnText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  bannerIllustration: { position: 'absolute', right: -10, bottom: -10 },

  // 未开通 — 服务包介绍 Banner
  activateBanner: {
    backgroundColor: colors.white, borderRadius: radius.xl,
    borderWidth: 1.5, borderColor: colors.primary + '30',
    padding: spacing.md, gap: spacing.md,
  },
  activateBannerLeft: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  activateIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  activateTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  activatePoints: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  activatePoint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  activatePointText: { fontSize: 12, color: colors.textSecondary },
  activateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 12, gap: 4,
  },
  activateBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  catChip: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white,
  },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  catChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  catChipTextActive: { color: colors.white, fontWeight: '700' },
  resultCount: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs },
  serviceCard: {
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.md, ...shadow.sm,
    position: 'relative', overflow: 'hidden',
  },
  serviceTag: {
    position: 'absolute', top: 12, right: 12,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full,
  },
  serviceTagText: { fontSize: 11, color: colors.white, fontWeight: '700' },
  serviceCardTop: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  serviceIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 4, paddingRight: 48 },
  serviceSubtitle: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginBottom: 6 },
  ratingNum: { fontSize: 11, color: colors.warning, fontWeight: '700', marginLeft: 3 },
  reviewCount: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  featureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  featureChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.primary + '10', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  featureText: { fontSize: 11, color: colors.primary },
  serviceCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  priceCurrency: { fontSize: 13, fontWeight: '700', color: colors.danger },
  priceVal: { fontSize: 24, fontWeight: '800', color: colors.danger },
  priceOriginal: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'line-through' },
  discountBadge: { backgroundColor: colors.danger + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  discountText: { fontSize: 11, color: colors.danger, fontWeight: '700' },
  buyBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.full },
  buyBtnText: { fontSize: 14, color: colors.white, fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl + 16,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginTop: 12, marginBottom: spacing.lg,
  },
  modalServiceRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  modalServiceIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  modalServiceInfo: { flex: 1, justifyContent: 'center', gap: 6 },
  modalServiceName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  modalPriceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.md,
  },
  modalPriceLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  modalPriceRight: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  modalOriginal: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'line-through' },
  modalPrice: { fontSize: 22, fontWeight: '800', color: colors.danger },
  modalFeatures: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  modalFeatureChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '10', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  modalFeatureText: { fontSize: 12, color: colors.primary, fontWeight: '500' },
  noteLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  noteInput: {
    backgroundColor: colors.background,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, fontSize: 14, color: colors.textPrimary,
    minHeight: 80, textAlignVertical: 'top', marginBottom: spacing.sm,
  },
  errText: { fontSize: 13, color: colors.danger, marginBottom: spacing.sm, textAlign: 'center' },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: spacing.lg },
  hintText: { flex: 1, fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  modalBtns: { flexDirection: 'row', gap: spacing.sm },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  submitBtn: {
    flex: 2, paddingVertical: 14, borderRadius: radius.md,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  submitBtnText: { fontSize: 15, color: colors.white, fontWeight: '700' },

  // Success state
  successIconWrap: { alignItems: 'center', marginBottom: spacing.md, marginTop: spacing.md },
  successTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  successDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
  successBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center', marginBottom: spacing.sm,
  },
  successBtnText: { fontSize: 16, color: colors.white, fontWeight: '700' },
});
