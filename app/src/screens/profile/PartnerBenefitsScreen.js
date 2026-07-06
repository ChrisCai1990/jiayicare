import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator, Modal, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { partnerBenefitsAPI } from '../../services/api';

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

  partnerSection: { marginTop: spacing.md },
  partnerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  partnerLogo: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.border },
  partnerLogoPlaceholder: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  partnerName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  partnerCategory: { fontSize: 11, color: colors.textMuted },

  benefitCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, ...shadow.sm,
  },
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
  modalTitle:    { flex: 1, fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  modalBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  modalSubtitle: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 6, marginTop: spacing.sm },
  sectionText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  usageBox: { backgroundColor: colors.primary + '0D', borderRadius: radius.xs, padding: spacing.sm, marginTop: 4 },

  modalFooter:  { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  closeBtn:     { paddingVertical: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  closeBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
});

function BenefitCard({ benefit, onPress }) {
  return (
    <TouchableOpacity style={styles.benefitCard} activeOpacity={0.8} onPress={() => onPress(benefit)}>
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

export default function PartnerBenefitsScreen({ navigation }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState(null); // { benefit, partner }

  const load = useCallback(async () => {
    try {
      const res = await partnerBenefitsAPI.list();
      if (res.success) setGroups(res.data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const openDetail = (partner, benefit) => setDetail({ partner, benefit });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>合作伙伴权益</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading ? (
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
                <BenefitCard key={b.id} benefit={b} onPress={(benefit) => openDetail(g.partner, benefit)} />
              ))}
            </View>
          ))
        )}
        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      {/* 权益详情弹窗 */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDetail(null)} />
          {detail && (
            <View style={styles.modalCard}>
              <View style={styles.handle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{detail.benefit.title}</Text>
              </View>
              <ScrollView style={{ maxHeight: 420 }}>
                <View style={styles.modalBody}>
                  {!!detail.benefit.subtitle && <Text style={styles.modalSubtitle}>{detail.benefit.subtitle}</Text>}

                  {detail.benefit.images?.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
                      {detail.benefit.images.map((url, i) => (
                        <Image key={i} source={{ uri: url }} style={{ width: 240, height: 160, borderRadius: radius.md, marginRight: spacing.sm }} resizeMode="cover" />
                      ))}
                    </ScrollView>
                  )}

                  <Text style={styles.sectionLabel}>提供方</Text>
                  <Text style={styles.sectionText}>{detail.partner.name}</Text>

                  {!!detail.benefit.description && (
                    <>
                      <Text style={styles.sectionLabel}>权益详情</Text>
                      <Text style={styles.sectionText}>{detail.benefit.description}</Text>
                    </>
                  )}

                  {!!detail.benefit.usageGuide && (
                    <>
                      <Text style={styles.sectionLabel}>使用说明</Text>
                      <View style={styles.usageBox}>
                        <Text style={styles.sectionText}>{detail.benefit.usageGuide}</Text>
                      </View>
                    </>
                  )}
                </View>
              </ScrollView>
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setDetail(null)}>
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
