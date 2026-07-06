import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator, Modal, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { giftsAPI, partnerBenefitsAPI } from '../../services/api';

const FUND_TYPE_LABEL  = { enterprise: '企业赠送', promotion: '活动奖励', other: '其他赠送' };
const GIFT_TYPE_LABEL  = { fund: '健康基金', service: '服务权益' };
const GIFT_TYPE_COLOR  = { fund: '#D97706', service: colors.primary };
const GIFT_TYPE_BG     = { fund: '#FEF3E2', service: colors.primary + '14' };
const GIFT_TYPE_ICON   = { fund: 'wallet-outline', service: 'gift-outline' };
const STATUS_LABEL     = { active: '有效', used: '已使用', expired: '已过期' };
const STATUS_COLOR     = { active: '#D97706', used: colors.textMuted, expired: colors.textMuted };
const STATUS_BG        = { active: '#FEF3E2', used: colors.border, expired: '#F5F5F5' };

const CATEGORY_ICON = {
  '口腔': 'medical-outline',
  '体检': 'clipboard-outline',
  '保险': 'shield-checkmark-outline',
  '酒店': 'bed-outline',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn:   { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },

  // Tab 切换
  tabRow: {
    flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm,
    backgroundColor: colors.border + '40', borderRadius: radius.full, padding: 3,
  },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.full, alignItems: 'center' },
  tabBtnActive: { backgroundColor: colors.white, ...shadow.xs },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.primary },

  // 基金卡片
  fundCard: {
    margin: spacing.lg, borderRadius: radius.md,
    backgroundColor: '#1A2B24', padding: spacing.lg, ...shadow.md,
  },
  fundLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 },
  fundTotal: { fontSize: 34, fontWeight: '800', color: '#fff', letterSpacing: -1, marginBottom: spacing.md },
  fundRow:   { flexDirection: 'row', gap: spacing.xl },
  fundItemLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 },
  fundItemVal:   { fontSize: 17, fontWeight: '700', color: '#fff' },

  // Section
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 1, textTransform: 'uppercase',
    marginHorizontal: spacing.lg, marginBottom: spacing.sm, marginTop: spacing.md,
  },

  // 权益卡片（赠送权益）
  giftCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, ...shadow.sm,
  },
  giftIconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  giftBody:  { flex: 1 },
  giftTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 3 },
  giftMeta:  { fontSize: 12, color: colors.textMuted },
  giftRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  giftBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  giftBadgeText: { fontSize: 12, fontWeight: '700' },

  // 合作伙伴权益
  partnerSection: { marginTop: spacing.md },
  partnerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  partnerLogo: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.border },
  partnerLogoPlaceholder: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  partnerName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  partnerCategory: { fontSize: 11, color: colors.textMuted },
  benefitThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: colors.background },
  benefitIconWrap: { width: 52, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '14' },
  benefitBody: { flex: 1 },
  benefitTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 3 },
  benefitSubtitle: { fontSize: 12, color: colors.textMuted },

  emptyWrap:  { alignItems: 'center', paddingVertical: spacing.xl * 2, paddingHorizontal: spacing.xl },
  emptyIcon:  { marginBottom: spacing.md },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  emptyDesc:  { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  loadingWrap:{ paddingTop: 40, alignItems: 'center' },

  // ── 详情弹窗 ──
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingBottom: 36, maxHeight: '85%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalIconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  modalTitle:    { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  modalBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  modalBadgeText:{ fontSize: 12, fontWeight: '700' },

  modalBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  modalSubtitle: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  rowLabel:  { fontSize: 13, color: colors.textMuted, width: 80 },
  rowValue:  { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 6, marginTop: spacing.sm },
  sectionText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  usageBox: { backgroundColor: colors.primary + '0D', borderRadius: radius.xs, padding: spacing.sm, marginTop: 4 },

  remarkBox: { backgroundColor: colors.background, borderRadius: radius.xs, padding: spacing.sm, marginTop: spacing.sm },
  remarkText:{ fontSize: 13, color: colors.textSecondary, lineHeight: 20 },

  modalFooter:  { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  closeBtn:     { paddingVertical: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  closeBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
});

function GiftCard({ gift, onPress }) {
  const color     = GIFT_TYPE_COLOR[gift.giftType] || colors.primary;
  const bg        = GIFT_TYPE_BG[gift.giftType]    || colors.primary + '14';
  const icon      = GIFT_TYPE_ICON[gift.giftType]  || 'gift-outline';
  const isExpired = gift.validTo && new Date(gift.validTo) < new Date();
  const isUsed    = gift.status === 'used';
  const statusKey = isUsed ? 'used' : isExpired ? 'expired' : 'active';

  return (
    <TouchableOpacity
      style={[styles.giftCard, (isExpired || isUsed) && { opacity: 0.6 }]}
      activeOpacity={0.8}
      onPress={() => onPress && onPress(gift)}
    >
      <View style={[styles.giftIconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.giftBody}>
        <Text style={styles.giftTitle}>
          {gift.giftType === 'fund'
            ? `健康基金 ¥${gift.fundAmount}（${FUND_TYPE_LABEL[gift.fundType] || '赠送'}）`
            : `${gift.serviceName}${gift.serviceCount > 1 ? ` × ${gift.serviceCount}次` : ''}`}
        </Text>
        <Text style={styles.giftMeta}>
          来自 {gift.staffId?.name || '健管团队'}
          {gift.validTo ? `  · 有效期至 ${new Date(gift.validTo).toLocaleDateString('zh-CN')}` : ''}
        </Text>
      </View>
      <View style={styles.giftRight}>
        <View style={[styles.giftBadge, { backgroundColor: STATUS_BG[statusKey] }]}>
          <Text style={[styles.giftBadgeText, { color: STATUS_COLOR[statusKey] }]}>{STATUS_LABEL[statusKey]}</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

function PartnerBenefitCard({ benefit, onPress }) {
  return (
    <TouchableOpacity style={styles.giftCard} activeOpacity={0.8} onPress={() => onPress(benefit)}>
      {benefit.images?.[0] ? (
        <Image source={{ uri: benefit.images[0] }} style={styles.benefitThumb} resizeMode="cover" />
      ) : (
        <View style={styles.benefitIconWrap}>
          <Ionicons name="gift-outline" size={24} color={colors.primary} />
        </View>
      )}
      <View style={styles.benefitBody}>
        <Text style={styles.benefitTitle}>{benefit.title}</Text>
        {!!benefit.subtitle && <Text style={styles.benefitSubtitle}>{benefit.subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function BenefitsScreen({ navigation }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('mine'); // 'mine' | 'partner'

  // ── 我的专属权益（健康基金 + 赠送服务次数）──
  const [gifts, setGifts]       = useState([]);
  const [giftsLoading, setGiftsLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailGift, setDetailGift] = useState(null);

  const fund = user?.healthFund || {};
  const fundTotal    = fund.total    ?? (user?.healthFundBalance || 0);
  const fundPersonal = fund.personal ?? 0;
  const fundCorp     = fund.corporate ?? 0;

  const loadGifts = useCallback(async () => {
    try {
      const res = await giftsAPI.list();
      if (res.success) setGifts(res.data);
    } catch {}
    finally { setGiftsLoading(false); setRefreshing(false); }
  }, []);

  // ── 合作伙伴权益 ──
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [detailBenefit, setDetailBenefit] = useState(null); // { benefit, partner }

  const loadPartnerBenefits = useCallback(async () => {
    try {
      const res = await partnerBenefitsAPI.list();
      if (res.success) setGroups(res.data);
    } catch {}
    finally { setGroupsLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadGifts(); loadPartnerBenefits(); }, [loadGifts, loadPartnerBenefits]);

  const onRefresh = () => {
    setRefreshing(true);
    if (tab === 'mine') loadGifts(); else loadPartnerBenefits();
  };

  const activeGifts  = gifts.filter(g => g.status === 'active');
  const historyGifts = gifts.filter(g => g.status !== 'active');

  // 专属权益详情弹窗辅助
  const dg = detailGift;
  const dgColor  = dg ? (GIFT_TYPE_COLOR[dg.giftType]  || colors.primary) : colors.primary;
  const dgBg     = dg ? (GIFT_TYPE_BG[dg.giftType]     || colors.primary + '14') : '';
  const dgIcon   = dg ? (GIFT_TYPE_ICON[dg.giftType]   || 'gift-outline') : 'gift-outline';
  const dgExpired = dg?.validTo && new Date(dg.validTo) < new Date();
  const dgStatusKey = dg?.status === 'used' ? 'used' : dgExpired ? 'expired' : 'active';

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : '不限';

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶栏 */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>会员权益</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Tab 切换 */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'mine' && styles.tabBtnActive]} onPress={() => setTab('mine')}>
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>我的专属权益</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'partner' && styles.tabBtnActive]} onPress={() => setTab('partner')}>
          <Text style={[styles.tabText, tab === 'partner' && styles.tabTextActive]}>合作伙伴权益</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {tab === 'mine' ? (
          <>
            {/* 健康基金卡 */}
            <View style={styles.fundCard}>
              <Text style={styles.fundLabel}>健康基金余额</Text>
              <Text style={styles.fundTotal}>¥{fundTotal.toLocaleString()}</Text>
              <View style={styles.fundRow}>
                <View>
                  <Text style={styles.fundItemLabel}>自有基金</Text>
                  <Text style={styles.fundItemVal}>¥{fundPersonal.toLocaleString()}</Text>
                </View>
                <View>
                  <Text style={styles.fundItemLabel}>企业赠送</Text>
                  <Text style={styles.fundItemVal}>¥{fundCorp.toLocaleString()}</Text>
                </View>
              </View>
            </View>

            {giftsLoading ? (
              <View style={styles.loadingWrap}><ActivityIndicator color={colors.primary} /></View>
            ) : (
              <>
                <Text style={styles.sectionTitle}>有效权益</Text>
                {activeGifts.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Ionicons name="gift-outline" size={48} color={colors.border} style={styles.emptyIcon} />
                    <Text style={styles.emptyTitle}>暂无有效权益</Text>
                    <Text style={styles.emptyDesc}>您的健康管理团队赠送的服务权益和健康基金将在此显示</Text>
                  </View>
                ) : (
                  activeGifts.map(g => <GiftCard key={g._id} gift={g} onPress={setDetailGift} />)
                )}

                {historyGifts.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>历史记录</Text>
                    {historyGifts.map(g => <GiftCard key={g._id} gift={g} onPress={setDetailGift} />)}
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {groupsLoading ? (
              <View style={styles.loadingWrap}><ActivityIndicator color={colors.primary} /></View>
            ) : groups.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="business-outline" size={48} color={colors.border} style={styles.emptyIcon} />
                <Text style={styles.emptyTitle}>暂无合作伙伴权益</Text>
                <Text style={styles.emptyDesc}>您的会员等级下暂无可用的合作伙伴权益，敬请期待</Text>
              </View>
            ) : (
              groups.map(g => (
                <View key={g.partner.id} style={styles.partnerSection}>
                  <View style={styles.partnerHeader}>
                    {g.partner.logo ? (
                      <Image source={{ uri: g.partner.logo }} style={styles.partnerLogo} />
                    ) : (
                      <View style={styles.partnerLogoPlaceholder}>
                        <Ionicons name={CATEGORY_ICON[g.partner.category] || 'business-outline'} size={18} color={colors.textMuted} />
                      </View>
                    )}
                    <View>
                      <Text style={styles.partnerName}>{g.partner.name}</Text>
                      <Text style={styles.partnerCategory}>{g.partner.category}</Text>
                    </View>
                  </View>
                  {g.benefits.map(b => (
                    <PartnerBenefitCard key={b.id} benefit={b} onPress={(benefit) => setDetailBenefit({ partner: g.partner, benefit })} />
                  ))}
                </View>
              ))
            )}
          </>
        )}
        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      {/* ── 专属权益详情弹窗 ── */}
      <Modal visible={!!detailGift} transparent animationType="slide" onRequestClose={() => setDetailGift(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDetailGift(null)} />
          {dg && (
            <View style={styles.modalCard}>
              <View style={styles.handle} />
              <View style={styles.modalHeader}>
                <View style={[styles.modalIconWrap, { backgroundColor: dgBg }]}>
                  <Ionicons name={dgIcon} size={22} color={dgColor} />
                </View>
                <Text style={styles.modalTitle}>
                  {dg.giftType === 'fund' ? `健康基金 ¥${dg.fundAmount}` : dg.serviceName || '服务权益'}
                </Text>
                <View style={[styles.modalBadge, { backgroundColor: STATUS_BG[dgStatusKey] }]}>
                  <Text style={[styles.modalBadgeText, { color: STATUS_COLOR[dgStatusKey] }]}>{STATUS_LABEL[dgStatusKey]}</Text>
                </View>
              </View>
              <View style={styles.modalBody}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>权益类型</Text>
                  <Text style={styles.rowValue}>{GIFT_TYPE_LABEL[dg.giftType] || '权益'}</Text>
                </View>
                {dg.giftType === 'fund' ? (
                  <>
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>基金金额</Text>
                      <Text style={[styles.rowValue, { color: '#D97706', fontWeight: '700', fontSize: 15 }]}>¥{dg.fundAmount}</Text>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>基金性质</Text>
                      <Text style={styles.rowValue}>{FUND_TYPE_LABEL[dg.fundType] || '赠送'}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>服务名称</Text>
                      <Text style={styles.rowValue}>{dg.serviceName}</Text>
                    </View>
                    {dg.serviceCount > 1 && (
                      <View style={styles.row}>
                        <Text style={styles.rowLabel}>次数</Text>
                        <Text style={styles.rowValue}>{dg.serviceCount} 次</Text>
                      </View>
                    )}
                  </>
                )}
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>赠送人</Text>
                  <Text style={styles.rowValue}>{dg.staffId?.name || '健管团队'}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>赠送时间</Text>
                  <Text style={styles.rowValue}>{fmtDate(dg.createdAt)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>有效期</Text>
                  <Text style={styles.rowValue}>
                    {dg.validFrom || dg.validTo ? `${fmtDate(dg.validFrom)} ~ ${fmtDate(dg.validTo)}` : '长期有效'}
                  </Text>
                </View>
                {!!dg.remark && (
                  <View style={styles.remarkBox}>
                    <Text style={styles.remarkText}>{dg.remark}</Text>
                  </View>
                )}
              </View>
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setDetailGift(null)}>
                  <Text style={styles.closeBtnText}>关闭</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* ── 合作伙伴权益详情弹窗 ── */}
      <Modal visible={!!detailBenefit} transparent animationType="slide" onRequestClose={() => setDetailBenefit(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDetailBenefit(null)} />
          {detailBenefit && (
            <View style={styles.modalCard}>
              <View style={styles.handle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{detailBenefit.benefit.title}</Text>
              </View>
              <ScrollView style={{ maxHeight: 420 }}>
                <View style={styles.modalBody}>
                  {!!detailBenefit.benefit.subtitle && <Text style={styles.modalSubtitle}>{detailBenefit.benefit.subtitle}</Text>}
                  {detailBenefit.benefit.images?.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
                      {detailBenefit.benefit.images.map((url, i) => (
                        <Image key={i} source={{ uri: url }} style={{ width: 240, height: 160, borderRadius: radius.md, marginRight: spacing.sm }} resizeMode="cover" />
                      ))}
                    </ScrollView>
                  )}
                  <Text style={styles.sectionLabel}>提供方</Text>
                  <Text style={styles.sectionText}>{detailBenefit.partner.name}</Text>
                  {!!detailBenefit.benefit.description && (
                    <>
                      <Text style={styles.sectionLabel}>权益详情</Text>
                      <Text style={styles.sectionText}>{detailBenefit.benefit.description}</Text>
                    </>
                  )}
                  {!!detailBenefit.benefit.usageGuide && (
                    <>
                      <Text style={styles.sectionLabel}>使用说明</Text>
                      <View style={styles.usageBox}>
                        <Text style={styles.sectionText}>{detailBenefit.benefit.usageGuide}</Text>
                      </View>
                    </>
                  )}
                </View>
              </ScrollView>
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setDetailBenefit(null)}>
                  <Text style={styles.closeBtnText}>关闭</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
