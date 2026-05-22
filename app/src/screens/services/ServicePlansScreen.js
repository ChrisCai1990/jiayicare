import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator,
  RefreshControl, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { plansAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// ── 方案类型 → 图标/颜色 ───────────────────────────────────────
const TYPE_META = {
  annual_checkup: { icon: 'calendar-outline',          color: '#0077B6', bg: '#E3F2FB', label: '年度体检' },
  checkup:        { icon: 'clipboard-outline',          color: '#0077B6', bg: '#E3F2FB', label: '体检方案' },
  annual_mgmt:    { icon: 'shield-checkmark-outline',  color: '#1E6B50', bg: '#E8F5EF', label: '健康管理' },
  health:         { icon: 'shield-checkmark-outline',  color: '#1E6B50', bg: '#E8F5EF', label: '健康管理' },
  nutrition:      { icon: 'nutrition-outline',          color: '#D97706', bg: '#FEF3E2', label: '营养干预' },
  medical_assist: { icon: 'people-outline',             color: '#7C3AED', bg: '#F2EEFF', label: '就医协助' },
  followup:       { icon: 'call-outline',               color: '#0369A1', bg: '#E0F2FE', label: '随访计划' },
  tcm:            { icon: 'leaf-outline',               color: '#059669', bg: '#D1FAE5', label: '中医方案' },
  psychology:     { icon: 'happy-outline',              color: '#9D174D', bg: '#FCE7F3', label: '心理咨询' },
  rehab:          { icon: 'fitness-outline',            color: '#DC3545', bg: '#FDEEEC', label: '运动康复' },
};
const DEFAULT_META = { icon: 'document-text-outline', color: colors.primary, bg: colors.primary + '12', label: '健康方案' };

const STATUS_META = {
  active:    { label: '进行中', color: colors.success, bg: '#E8F5EF' },
  draft:     { label: '待确认', color: colors.warning, bg: '#FEF3E2' },
  completed: { label: '已完成', color: colors.textMuted, bg: '#F5F5F5' },
  cancelled: { label: '已取消', color: colors.danger,  bg: '#FDEEEC' },
};

const ITEM_STATUS_META = {
  completed: { label: '已完成', color: colors.success, bg: '#E8F5EF', icon: 'checkmark-circle' },
  pending:   { label: '待完成', color: colors.warning, bg: '#FEF3E2', icon: 'ellipse-outline' },
  skipped:   { label: '已跳过', color: colors.textMuted, bg: '#F5F5F5', icon: 'remove-circle-outline' },
};

// ── Demo 兜底数据（无真实方案时展示）─────────────────────────────
const DEMO_PLANS = [
  {
    _id: 'demo_1', type: 'annual_checkup', status: 'active',
    title: '年度体检方案',
    description: '全面的年度健康筛查，涵盖基础体检、专项检查及报告解读，帮助您及早发现健康风险。',
    items: [
      { name: '年度综合体检套餐', status: 'pending', notes: '建议在空腹状态下进行，提前预约体检中心' },
      { name: '肿瘤标志物检测', status: 'pending', notes: '包含AFP、CEA、CA199等常见肿瘤标志物' },
      { name: '心脑血管专项评估', status: 'pending', notes: '含心电图、颈动脉超声等检查项目' },
      { name: 'AI 体检报告解读', status: 'pending', notes: '体检完成后上传报告，AI自动解读并推送建议' },
    ],
  },
  {
    _id: 'demo_2', type: 'annual_mgmt', status: 'active',
    title: '年度健康管理方案',
    description: '全年持续跟踪管理，定期随访、动态监测与专属健康顾问服务，全程守护您的健康。',
    items: [
      { name: '季度健康随访（4次/年）', status: 'pending', notes: '每季度由健管师进行一次深度健康随访' },
      { name: '月度健康数据分析报告', status: 'pending', notes: '每月汇总健康数据，生成个性化分析报告' },
      { name: '专属家庭医生一对一', status: 'pending', notes: '绑定专属家庭医生，提供个性化健康咨询' },
      { name: '慢病管理与用药跟踪', status: 'pending', notes: '如有慢性病，定期跟踪用药情况及指标变化' },
    ],
  },
];

// ── 样式 ────────────────────────────────────────────────────────
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

  content: { padding: spacing.lg, gap: spacing.md },

  introCard: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.primary + '10',
    borderRadius: radius.sm, padding: spacing.md,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  introText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  planCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', ...shadow.sm,
  },
  planHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md,
  },
  planIconWrap: {
    width: 44, height: 44, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  planTitleWrap: { flex: 1 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  planTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  statusChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  statusChipText: { fontSize: 10, fontWeight: '700' },
  planDescShort: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  planStaff: { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  planBody: {
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    padding: spacing.md, gap: spacing.xs,
  },
  planSummary: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: spacing.sm },
  planItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 8, paddingHorizontal: spacing.sm,
    borderRadius: radius.xs,
  },
  planItemText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  planItemDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  datesRow: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: spacing.sm,
  },
  dateChip: {
    flex: 1, alignItems: 'center', gap: 2,
    backgroundColor: colors.background, borderRadius: radius.sm, padding: 8,
  },
  dateChipLabel: { fontSize: 10, color: colors.textMuted },
  dateChipValue: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  consultBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: spacing.sm, paddingVertical: 10,
    borderRadius: radius.md, borderWidth: 1.5,
  },
  consultBtnText: { fontSize: 13, fontWeight: '600' },

  emptyWrap: { paddingVertical: spacing.xl * 2, alignItems: 'center', gap: spacing.sm },
  emptyText: { fontSize: 14, color: colors.textMuted },
  emptySubText: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },

  loadingWrap: { paddingVertical: spacing.xl * 2, alignItems: 'center' },

  // ── 详情弹窗 ─────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalIconWrap: {
    width: 40, height: 40, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  modalStatusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  modalStatusText: { fontSize: 11, fontWeight: '700' },

  modalBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  modalSectionLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', marginBottom: 6, marginTop: spacing.sm },
  modalNotes: {
    fontSize: 13, color: colors.textSecondary, lineHeight: 20,
    backgroundColor: colors.background, borderRadius: radius.xs,
    padding: spacing.sm,
  },
  modalNoNotes: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },

  modalFooter: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
  },
  modalCloseBtn: {
    flex: 1, paddingVertical: 11, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center',
  },
  modalCloseBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  modalCompleteBtn: {
    flex: 2, paddingVertical: 11, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
  },
  modalCompleteBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },

  // ── 确认弹窗 ─────────────────────────────────────────────────
  confirmOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  confirmBox: {
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.lg, width: '100%', maxWidth: 340,
  },
  confirmTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  confirmMessage: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  confirmBtnRow: { flexDirection: 'row', gap: spacing.sm },
  confirmCancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  confirmCancelText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  confirmOkBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center',
  },
  confirmOkText: { fontSize: 14, fontWeight: '700', color: colors.white },
});

// ── 确认弹窗组件（web 兼容）─────────────────────────────────────
function ConfirmModal({ visible, title, message, onConfirm, onCancel, loading }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmBox}>
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmMessage}>{message}</Text>
          <View style={styles.confirmBtnRow}>
            <TouchableOpacity style={styles.confirmCancelBtn} onPress={onCancel} disabled={loading}>
              <Text style={styles.confirmCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmOkBtn, loading && { opacity: 0.6 }]}
              onPress={onConfirm} disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={styles.confirmOkText}>确认完成</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 方案卡片 ─────────────────────────────────────────────────────
function PlanCard({ plan, expanded, onToggle, onItemPress }) {
  const meta = TYPE_META[plan.type] || DEFAULT_META;
  const sm   = STATUS_META[plan.status] || STATUS_META.draft;

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) : '未设置';
  const progressDone = (plan.items || []).filter(i => i.status === 'completed').length;
  const progressTotal = (plan.items || []).length;

  return (
    <View style={styles.planCard}>
      {/* 标题栏 */}
      <TouchableOpacity style={styles.planHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={[styles.planIconWrap, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={22} color={meta.color} />
        </View>
        <View style={styles.planTitleWrap}>
          <View style={styles.planTitleRow}>
            <Text style={styles.planTitle} numberOfLines={1}>{plan.title}</Text>
            <View style={[styles.statusChip, { backgroundColor: sm.bg }]}>
              <Text style={[styles.statusChipText, { color: sm.color }]}>{sm.label}</Text>
            </View>
          </View>
          <Text style={styles.planDescShort} numberOfLines={expanded ? 0 : 1}>
            {plan.description || meta.label}
          </Text>
          {plan.staffId?.name && (
            <Text style={styles.planStaff}>由 {plan.staffId.name} 制定</Text>
          )}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      </TouchableOpacity>

      {/* 展开内容 */}
      {expanded && (
        <View style={styles.planBody}>
          {plan.summary ? (
            <Text style={styles.planSummary}>{plan.summary}</Text>
          ) : null}

          {/* 任务项目 */}
          {(plan.items || []).map((item, i) => (
            <TouchableOpacity
              key={item._id || i}
              style={[styles.planItem, { backgroundColor: i % 2 === 0 ? colors.background + '80' : 'transparent' }]}
              activeOpacity={0.7}
              onPress={() => onItemPress && onItemPress(item, plan, meta)}
            >
              <Ionicons
                name={item.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={item.status === 'completed' ? colors.success : meta.color}
              />
              <Text style={[styles.planItemText, item.status === 'completed' && styles.planItemDone]}>
                {item.name}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          ))}

          {/* 进度 */}
          {progressTotal > 0 && (
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4, paddingHorizontal: spacing.sm }}>
              已完成 {progressDone}/{progressTotal} 项
            </Text>
          )}

          {/* 时间段 */}
          {(plan.startDate || plan.endDate) && (
            <View style={styles.datesRow}>
              <View style={styles.dateChip}>
                <Text style={styles.dateChipLabel}>开始时间</Text>
                <Text style={styles.dateChipValue}>{formatDate(plan.startDate)}</Text>
              </View>
              <View style={styles.dateChip}>
                <Text style={styles.dateChipLabel}>结束时间</Text>
                <Text style={styles.dateChipValue}>{formatDate(plan.endDate)}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.consultBtn, { borderColor: meta.color + '60' }]}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={14} color={meta.color} />
            <Text style={[styles.consultBtnText, { color: meta.color }]}>咨询健康管理师</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function ServicePlansScreen({ navigation }) {
  const { isDemo } = useAuth();
  const [plans, setPlans]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded]     = useState(null);

  // 详情弹窗：{ item, plan, meta }
  const [detailModal, setDetailModal]         = useState(null);
  // 确认弹窗
  const [confirmVisible, setConfirmVisible]   = useState(false);
  const [completing, setCompleting]           = useState(false);

  const loadPlans = useCallback(async () => {
    try {
      const res = await plansAPI.list();
      if (res.success && res.data?.length > 0) {
        setPlans(res.data);
      } else {
        setPlans(isDemo ? DEMO_PLANS : []);
      }
    } catch {
      setPlans(isDemo ? DEMO_PLANS : []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemo]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const toggle = (id) => setExpanded(prev => prev === id ? null : id);

  // 打开详情弹窗
  const handleItemPress = (item, plan, meta) => {
    setDetailModal({ item, plan, meta });
  };

  // 点击"标记已完成"
  const handleCompletePress = () => {
    setConfirmVisible(true);
  };

  // 确认完成
  const handleConfirmComplete = async () => {
    if (!detailModal) return;
    const { item, plan } = detailModal;
    if (!item._id || item.status === 'completed') {
      setConfirmVisible(false);
      return;
    }
    setCompleting(true);
    try {
      await plansAPI.completeItem(plan._id, item._id);
      // 更新本地状态
      setPlans(prev => prev.map(p => {
        if (p._id !== plan._id) return p;
        return {
          ...p,
          items: (p.items || []).map(it =>
            it._id === item._id ? { ...it, status: 'completed' } : it
          ),
        };
      }));
      // 更新弹窗中的 item 状态
      setDetailModal(prev => prev ? { ...prev, item: { ...prev.item, status: 'completed' } } : null);
      setConfirmVisible(false);
    } catch (err) {
      // 错误直接关闭确认框，保留详情弹窗
      setConfirmVisible(false);
    } finally {
      setCompleting(false);
    }
  };

  const isCompleted = detailModal?.item?.status === 'completed';
  const canComplete = detailModal?.item?._id && !isCompleted;

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶栏 */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>健康方案</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPlans(); }} tintColor={colors.primary} />}
        >
          {/* 说明 */}
          <View style={styles.introCard}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.introText}>
              以下健康方案由您的医护团队为您定制并推送，请按方案完成各项健康管理任务。
            </Text>
          </View>

          {plans.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>暂无健康方案</Text>
              <Text style={styles.emptySubText}>
                待医护团队为您制定并推送健康方案后{'\n'}将在此处显示
              </Text>
            </View>
          ) : (
            plans.map(plan => (
              <PlanCard
                key={plan._id}
                plan={plan}
                expanded={expanded === plan._id}
                onToggle={() => toggle(plan._id)}
                onItemPress={handleItemPress}
              />
            ))
          )}

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      )}

      {/* ── 任务详情弹窗 ── */}
      <Modal
        visible={!!detailModal}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModal(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setDetailModal(null)}
          />
          {detailModal && (() => {
            const { item, meta } = detailModal;
            const ism = ITEM_STATUS_META[item.status] || ITEM_STATUS_META.pending;
            return (
              <View style={styles.modalCard}>
                <View style={styles.modalHandle} />

                {/* 弹窗标题行 */}
                <View style={styles.modalHeader}>
                  <View style={[styles.modalIconWrap, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={20} color={meta.color} />
                  </View>
                  <Text style={styles.modalTitle} numberOfLines={2}>{item.name}</Text>
                  <View style={[styles.modalStatusChip, { backgroundColor: ism.bg }]}>
                    <Text style={[styles.modalStatusText, { color: ism.color }]}>{ism.label}</Text>
                  </View>
                </View>

                {/* 弹窗正文 */}
                <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalSectionLabel}>任务说明</Text>
                  {item.notes ? (
                    <Text style={styles.modalNotes}>{item.notes}</Text>
                  ) : (
                    <Text style={styles.modalNoNotes}>暂无说明，请联系健康管理师了解详情。</Text>
                  )}

                  {item.completedAt && (
                    <>
                      <Text style={styles.modalSectionLabel}>完成时间</Text>
                      <Text style={styles.modalNotes}>
                        {new Date(item.completedAt).toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </>
                  )}

                  <View style={{ height: spacing.md }} />
                </ScrollView>

                {/* 按钮行 */}
                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={() => setDetailModal(null)}
                  >
                    <Text style={styles.modalCloseBtnText}>关闭</Text>
                  </TouchableOpacity>

                  {canComplete && (
                    <TouchableOpacity
                      style={[styles.modalCompleteBtn, { backgroundColor: meta.color }]}
                      onPress={handleCompletePress}
                    >
                      <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
                      <Text style={styles.modalCompleteBtnText}>标记已完成</Text>
                    </TouchableOpacity>
                  )}

                  {isCompleted && (
                    <View style={[styles.modalCompleteBtn, { backgroundColor: colors.success + '20', flex: 2 }]}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                      <Text style={[styles.modalCompleteBtnText, { color: colors.success }]}>已完成</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* ── 确认完成弹窗 ── */}
      <ConfirmModal
        visible={confirmVisible}
        title="确认完成"
        message={`确认已完成「${detailModal?.item?.name || ''}」？\n完成后将通知您的健康管理团队。`}
        onConfirm={handleConfirmComplete}
        onCancel={() => setConfirmVisible(false)}
        loading={completing}
      />
    </SafeAreaView>
  );
}
