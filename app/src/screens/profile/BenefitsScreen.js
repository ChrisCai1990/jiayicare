import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { giftsAPI } from '../../services/api';

const FUND_TYPE_LABEL = { enterprise: '企业赠送', promotion: '活动奖励', other: '其他赠送' };
const GIFT_TYPE_LABEL = { fund: '健康基金', service: '服务权益' };
const GIFT_TYPE_COLOR = { fund: '#D97706', service: colors.primary };
const GIFT_TYPE_BG    = { fund: '#FEF3E2', service: colors.primary + '14' };
const GIFT_TYPE_ICON  = { fund: 'wallet-outline', service: 'gift-outline' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },

  // 基金卡片
  fundCard: {
    margin: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: '#1A2B24',
    padding: spacing.lg,
    ...shadow.md,
  },
  fundLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 },
  fundTotal: { fontSize: 34, fontWeight: '800', color: '#fff', letterSpacing: -1, marginBottom: spacing.md },
  fundRow: { flexDirection: 'row', gap: spacing.xl },
  fundItem: {},
  fundItemLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 },
  fundItemVal: { fontSize: 17, fontWeight: '700', color: '#fff' },

  // Section
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 1, textTransform: 'uppercase',
    marginHorizontal: spacing.lg, marginBottom: spacing.sm, marginTop: spacing.md,
  },

  // 权益卡片
  giftCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  giftIconWrap: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  giftBody: { flex: 1 },
  giftTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 3 },
  giftMeta: { fontSize: 12, color: colors.textMuted },
  giftBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.full,
  },
  giftBadgeText: { fontSize: 12, fontWeight: '700' },

  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xl * 2, paddingHorizontal: spacing.xl },
  emptyIcon: { marginBottom: spacing.md },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  loadingWrap: { paddingTop: 40, alignItems: 'center' },
});

function GiftCard({ gift }) {
  const color = GIFT_TYPE_COLOR[gift.giftType] || colors.primary;
  const bg    = GIFT_TYPE_BG[gift.giftType]    || colors.primary + '14';
  const icon  = GIFT_TYPE_ICON[gift.giftType]  || 'gift-outline';
  const isExpired = gift.validTo && new Date(gift.validTo) < new Date();
  const isUsed = gift.status === 'used';

  return (
    <View style={[styles.giftCard, (isExpired || isUsed) && { opacity: 0.55 }]}>
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
        {gift.remark ? <Text style={[styles.giftMeta, { marginTop: 2 }]}>{gift.remark}</Text> : null}
      </View>
      <View style={[styles.giftBadge, { backgroundColor: isUsed ? colors.border : isExpired ? '#f5f5f5' : bg }]}>
        <Text style={[styles.giftBadgeText, { color: isUsed ? colors.textMuted : isExpired ? colors.textMuted : color }]}>
          {isUsed ? '已使用' : isExpired ? '已过期' : '有效'}
        </Text>
      </View>
    </View>
  );
}

export default function BenefitsScreen({ navigation }) {
  const { user } = useAuth();
  const [gifts, setGifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fund = user?.healthFund || {};
  const fundTotal    = fund.total    ?? (user?.healthFundBalance || 0);
  const fundCorporate = fund.corporate ?? 0;
  const fundPersonal  = fund.personal  ?? 0;

  const load = useCallback(async () => {
    try {
      const res = await giftsAPI.list();
      if (res.success) setGifts(res.data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const activeGifts  = gifts.filter(g => g.status === 'active');
  const historyGifts = gifts.filter(g => g.status !== 'active');

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶栏 */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>我的权益</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* 健康基金卡 */}
        <View style={styles.fundCard}>
          <Text style={styles.fundLabel}>健康基金余额</Text>
          <Text style={styles.fundTotal}>¥{fundTotal.toLocaleString()}</Text>
          <View style={styles.fundRow}>
            <View style={styles.fundItem}>
              <Text style={styles.fundItemLabel}>自有基金</Text>
              <Text style={styles.fundItemVal}>¥{fundPersonal.toLocaleString()}</Text>
            </View>
            <View style={styles.fundItem}>
              <Text style={styles.fundItemLabel}>企业赠送</Text>
              <Text style={styles.fundItemVal}>¥{fundCorporate.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* 有效权益 */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
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
              activeGifts.map(g => <GiftCard key={g._id} gift={g} />)
            )}

            {historyGifts.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>历史记录</Text>
                {historyGifts.map(g => <GiftCard key={g._id} gift={g} />)}
              </>
            )}
          </>
        )}

        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
