import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator,
  RefreshControl, Modal, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { plansAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const TYPE_META = {
  annual_checkup: { icon: 'calendar-outline',         color: '#0077B6', bg: '#E3F2FB', label: '年度体检' },
  checkup:        { icon: 'clipboard-outline',         color: '#0077B6', bg: '#E3F2FB', label: '体检方案' },
  annual_mgmt:    { icon: 'shield-checkmark-outline', color: '#1E6B50', bg: '#E8F5EF', label: '健康管理' },
  health:         { icon: 'shield-checkmark-outline', color: '#1E6B50', bg: '#E8F5EF', label: '健康管理' },
  nutrition:      { icon: 'nutrition-outline',         color: '#D97706', bg: '#FEF3E2', label: '营养干预' },
  medical_assist: { icon: 'people-outline',            color: '#7C3AED', bg: '#F2EEFF', label: '就医协助' },
  followup:       { icon: 'call-outline',              color: '#0369A1', bg: '#E0F2FE', label: '随访计划' },
  tcm:            { icon: 'leaf-outline',              color: '#059669', bg: '#D1FAE5', label: '中医方案' },
  psychology:     { icon: 'happy-outline',             color: '#9D174D', bg: '#FCE7F3', label: '心理咨询' },
  rehab:          { icon: 'fitness-outline',           color: '#DC3545', bg: '#FDEEEC', label: '运动康复' },
};
const DEFAULT_META = { icon: 'document-text-outline', color: colors.primary, bg: colors.primary + '12', label: '健康方案' };

// 就医协助按模板细分服务类型，标签用具体服务名而非笼统"就医协助"，
// 让客户一眼看出这次买的是哪种标准化服务（2026-07-13反馈"模版就是为了标准化"，与医护端徽章一致）
const MEDICAL_ASSIST_SUB_META = [
  { match: /代配药|代取药/,       icon: 'medkit-outline' },
  { match: /代约检/,             icon: 'reader-outline' },
  { match: /医疗代诊/,           icon: 'medical-outline' },
  { match: /陪同就医|陪同治疗/,   icon: 'people-outline' },
  { match: /陪同检查|陪同体检/,   icon: 'flask-outline' },
  { match: /健康体检/,           icon: 'calendar-outline' },
  { match: /一站式|住院/,        icon: 'star-outline' },
  { match: /咨询/,               icon: 'chatbubble-ellipses-outline' },
];
function getAssistSubMeta(templateName) {
  const base = TYPE_META.medical_assist;
  if (!templateName) return base;
  const hit = MEDICAL_ASSIST_SUB_META.find(m => m.match.test(templateName));
  return { ...base, icon: hit?.icon || base.icon, label: templateName };
}

const STATUS_META = {
  active:    { label: '进行中', color: colors.success,  bg: '#E8F5EF' },
  draft:     { label: '待确认', color: colors.warning,  bg: '#FEF3E2' },
  completed: { label: '已完成', color: colors.textMuted, bg: '#F5F5F5' },
  cancelled: { label: '已取消', color: colors.danger,   bg: '#FDEEEC' },
};

const ITEM_STATUS_META = {
  completed: { label: '已完成', color: colors.success,  bg: '#E8F5EF', icon: 'checkmark-circle' },
  pending:   { label: '待完成', color: colors.warning,  bg: '#FEF3E2', icon: 'ellipse-outline' },
  skipped:   { label: '已跳过', color: colors.textMuted, bg: '#F5F5F5', icon: 'remove-circle-outline' },
};

const DEMO_PLANS = [
  {
    _id: 'demo_1', type: 'annual_checkup', status: 'active',
    title: '年度体检方案',
    description: '全面的年度健康筛查，涵盖基础体检、专项检查及专属健康团队解读，帮助您及早发现健康风险。',
    items: [
      { name: '年度综合体检套餐', status: 'pending', notes: '建议空腹进行，提前预约体检中心' },
      { name: '肿瘤标志物检测',   status: 'pending', notes: '含AFP、CEA、CA199等常见肿瘤标志物' },
      { name: '心脑血管专项评估', status: 'pending', notes: '含心电图、颈动脉超声等检查项目' },
      { name: '健康团队专业解读', status: 'pending', notes: '体检完成后上传健康资料，AI初步分析并由专属健康团队推送建议' },
    ],
  },
  {
    _id: 'demo_2', type: 'annual_mgmt', status: 'draft',
    title: '年度健康管理方案',
    description: '全年持续跟踪管理，定期随访、动态监测与专属健康顾问服务，全程守护您的健康。',
    items: [
      { name: '季度健康随访（4次/年）', status: 'pending', notes: '每季度由健管师进行一次深度健康随访' },
      { name: '月度健康数据分析报告',   status: 'pending', notes: '每月汇总健康数据，生成个性化分析报告' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn:   { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  content:   { padding: spacing.lg, gap: spacing.md },

  introCard: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.primary + '10', borderRadius: radius.sm,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  introText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  // ── 方案卡片 ──
  planCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm,
  },
  planHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
  },
  planIconWrap: {
    width: 44, height: 44, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  planTitleWrap: { flex: 1 },
  planTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  planTitle:     { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  statusChip:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  statusChipText:{ fontSize: 10, fontWeight: '700' },
  planDesc:      { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  planStaff:     { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  planBody: {
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    padding: spacing.md, gap: spacing.xs,
  },
  planSummary: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: spacing.sm },

  // 就医协助方案：结构化信息卡片
  assistInfoCard: {
    backgroundColor: colors.background, borderRadius: radius.sm,
    padding: spacing.sm, marginBottom: spacing.sm, gap: 6,
  },
  assistInfoRow: { flexDirection: 'row', gap: 6 },
  assistInfoLabel: { fontSize: 12, color: colors.textMuted, width: 60, flexShrink: 0 },
  assistInfoValue: { fontSize: 12, color: colors.textSecondary, flex: 1, lineHeight: 18 },

  // 草稿确认横幅
  draftBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#FEF3E2', borderRadius: radius.sm,
    padding: spacing.sm, marginBottom: spacing.sm,
  },
  draftBannerText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  // 任务项目行
  planItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 9, paddingHorizontal: spacing.sm,
    borderRadius: radius.xs,
  },
  planItemText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  planItemDone: { textDecorationLine: 'line-through', color: colors.textMuted },

  // 进度 & 日期
  progressText: { fontSize: 11, color: colors.textMuted, marginTop: 4, paddingHorizontal: spacing.sm },
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

  // 底部按钮行
  planFooter: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  confirmBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  confirmBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },
  consultBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5,
  },
  consultBtnText: { fontSize: 13, fontWeight: '600' },

  // 空 items 提示
  emptyItems: {
    alignItems: 'center', paddingVertical: spacing.lg, gap: 6,
  },
  emptyItemsText: { fontSize: 13, color: colors.textMuted },

  // 空页面
  emptyWrap: { paddingVertical: spacing.xl * 2, alignItems: 'center', gap: spacing.sm },
  emptyText: { fontSize: 14, color: colors.textMuted },
  emptySubText: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },

  loadingWrap: { paddingVertical: spacing.xl * 2, alignItems: 'center' },

  // ── 详情弹窗 ──
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:  {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingBottom: 32, maxHeight: '82%',
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
  modalIconWrap: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  modalTitle:  { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  modalStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  modalStatusText: { fontSize: 11, fontWeight: '700' },

  modalBody:         { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  modalSectionLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', marginBottom: 6, marginTop: spacing.sm },
  modalNotes:        { fontSize: 13, color: colors.textSecondary, lineHeight: 20, backgroundColor: colors.background, borderRadius: radius.xs, padding: spacing.sm },
  modalNoNotes:      { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },

  modalFooter: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  modalCloseBtn: {
    flex: 1, paddingVertical: 11, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  modalCloseBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  modalCompleteBtn: {
    flex: 2, paddingVertical: 11, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
  },
  modalCompleteBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },

  // ── 确认弹窗 ──
  confirmOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg,
  },
  confirmBox: {
    backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.lg,
    width: '100%', maxWidth: 340,
  },
  confirmTitle:   { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  confirmMessage: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  confirmBtnRow:  { flexDirection: 'row', gap: spacing.sm },
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

// ── 确认弹窗（web 兼容）────────────────────────────────────────────
function ConfirmModal({ visible, title, message, confirmText, confirmColor, onConfirm, onCancel, loading }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.confirmOverlay}>
        <View style={s.confirmBox}>
          <Text style={s.confirmTitle}>{title}</Text>
          <Text style={s.confirmMessage}>{message}</Text>
          <View style={s.confirmBtnRow}>
            <TouchableOpacity style={s.confirmCancelBtn} onPress={onCancel} disabled={loading}>
              <Text style={s.confirmCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.confirmOkBtn, { backgroundColor: confirmColor || colors.success }, loading && { opacity: 0.6 }]}
              onPress={onConfirm} disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={s.confirmOkText}>{confirmText || '确认'}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 方案卡片 ─────────────────────────────────────────────────────
function PlanCard({ plan, expanded, onToggle, onItemPress, onConfirmPlan, confirming, onConsult, onRenew }) {
  const meta = plan.type === 'medical_assist'
    ? getAssistSubMeta(plan.content?.templateName)
    : (TYPE_META[plan.type] || DEFAULT_META);
  const sm   = STATUS_META[plan.status] || STATUS_META.draft;
  const isDraft = plan.status === 'draft';
  const needsConfirm = !plan.confirmedAt && (plan.pushedAt || plan.status === 'active' || isDraft);

  const formatDate = (d) => d
    ? new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
    : '未设置';
  // 合并标准项目 + 加项（content.addons）
  const addonItems = (plan.content?.addons || []).map((a, i) => ({
    _id: `addon_${i}`, name: a.name, notes: a.reason || '', status: 'pending', isAddon: true,
  }));
  const allItems = [...(plan.items || []), ...addonItems];
  const progressDone  = allItems.filter(i => i.status === 'completed').length;
  const progressTotal = allItems.length;

  return (
    <View style={[s.planCard, isDraft && { borderColor: colors.warning + '60' }]}>
      {/* 标题行 */}
      <TouchableOpacity style={s.planHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={[s.planIconWrap, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={22} color={meta.color} />
        </View>
        <View style={s.planTitleWrap}>
          <View style={s.planTitleRow}>
            <Text style={s.planTitle} numberOfLines={1}>{plan.title}</Text>
            <View style={[s.statusChip, { backgroundColor: sm.bg }]}>
              <Text style={[s.statusChipText, { color: sm.color }]}>{sm.label}</Text>
            </View>
          </View>
          {/* 就医协助按模板细分服务类型（如"医疗代诊服务"），同一患者多次生成时标题常年雷同（AI都写"XX就医协助方案"），
              不加这个标签折叠态完全分不清是哪次预约（2026-07-13 反馈"三份方案命名都一样"）*/}
          {plan.type === 'medical_assist' && plan.content?.templateName && (
            <View style={{ backgroundColor: meta.bg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 2 }}>
              <Text style={{ fontSize: 11, color: meta.color, fontWeight: '600' }}>{plan.content.templateName}</Text>
            </View>
          )}
          {plan.year && (
            <View style={{ backgroundColor: meta.bg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 2 }}>
              <Text style={{ fontSize: 11, color: meta.color, fontWeight: '600' }}>{plan.year} 年度</Text>
            </View>
          )}
          <Text style={s.planDesc} numberOfLines={expanded ? 0 : 1}>
            {plan.description || meta.label}
          </Text>
          {plan.staffId?.name && (
            <Text style={s.planStaff}>由 {plan.staffId.name} 制定</Text>
          )}
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {/* 展开内容 */}
      {expanded && (
        <View style={s.planBody}>
          {plan.summary ? <Text style={s.planSummary}>{plan.summary}</Text> : null}

          {/* 就医协助方案：医院/科室/专家/住宿/交通等结构化信息，与任务清单(items)分开展示，
              避免只有 items 时看不到方案核心信息（2026-07-13 客户反馈"看不到具体方案"修复） */}
          {plan.type === 'medical_assist' && (() => {
            const c = plan.content || {};
            const rows = [
              ['医院', c.hospital && c.department ? `${c.hospital} · ${c.department}` : (c.hospital || c.department)],
              ['专家', c.expert],
              ['住宿', c.hotel],
              ['交通', c.transport],
            ].filter(([, v]) => !!v);
            const standardSteps = c.templateSnapshot?.tasks;
            return (
              <>
                {c.templateName && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.sm }}>
                    <Ionicons name="ribbon-outline" size={13} color={colors.primary} />
                    <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>标准化服务 · {c.templateName}</Text>
                  </View>
                )}
                {standardSteps && (
                  <View style={[s.assistInfoCard, { backgroundColor: colors.primary + '0C' }]}>
                    <Text style={[s.assistInfoLabel, { width: 'auto', marginBottom: 2 }]}>标准服务步骤</Text>
                    <Text style={s.assistInfoValue}>{standardSteps}</Text>
                  </View>
                )}
                {rows.length > 0 && (
                  <View style={s.assistInfoCard}>
                    {rows.map(([label, value]) => (
                      <View key={label} style={s.assistInfoRow}>
                        <Text style={s.assistInfoLabel}>{label}</Text>
                        <Text style={s.assistInfoValue}>{value}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            );
          })()}

          {/* 草稿待确认提示 */}
          {isDraft && (
            <View style={s.draftBanner}>
              <Ionicons name="information-circle-outline" size={18} color="#D97706" />
              <Text style={s.draftBannerText}>
                此方案由您的医护团队制定，请确认后方可启动执行。
              </Text>
            </View>
          )}

          {/* 任务项列表 */}
          {progressTotal > 0 ? (
            allItems.map((item, i) => (
              <TouchableOpacity
                key={item._id || i}
                style={[s.planItem, { backgroundColor: i % 2 === 0 ? colors.background + '80' : 'transparent', flexDirection: 'column', alignItems: 'flex-start', gap: 0 }]}
                activeOpacity={0.7}
                onPress={() => onItemPress && onItemPress(item, plan, meta)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, width: '100%' }}>
                  <Ionicons
                    name={item.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={item.status === 'completed' ? colors.success : meta.color}
                  />
                  <Text style={[s.planItemText, item.status === 'completed' && s.planItemDone, { flex: 1 }]}>
                    {item.name}
                  </Text>
                  {item.isAddon && (
                    <View style={{ backgroundColor: '#FEF3E2', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginRight: 4 }}>
                      <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '600' }}>加项</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </View>
                {!!item.notes && (
                  <Text style={{ fontSize: 11, color: colors.textMuted, lineHeight: 17, marginTop: 4, marginLeft: 24, paddingRight: 20 }} numberOfLines={3}>
                    {item.notes}
                  </Text>
                )}
              </TouchableOpacity>
            ))
          ) : (
            <View style={s.emptyItems}>
              <Ionicons name="list-outline" size={32} color={colors.border} />
              {(plan.description || plan.notes) ? (
                <>
                  {!!plan.description && plan.description !== '个人专属健康管理方案' && (
                    <Text style={[s.emptyItemsText, { fontWeight: '600', color: '#1A2B24', marginBottom: 4 }]}>{plan.description}</Text>
                  )}
                  {!!plan.notes && (
                    <Text style={[s.emptyItemsText, { textAlign: 'left', lineHeight: 20, color: '#4A6558' }]}>{plan.notes}</Text>
                  )}
                  <Text style={[s.emptyItemsText, { color: colors.textMuted, marginTop: 8 }]}>如有疑问请联系健管师</Text>
                </>
              ) : (
                <Text style={s.emptyItemsText}>方案内容正在配置中，如有疑问请联系健管师</Text>
              )}
            </View>
          )}

          {/* 进度 */}
          {progressTotal > 0 && (
            <Text style={s.progressText}>已完成 {progressDone}/{progressTotal} 项</Text>
          )}

          {/* 时间段 */}
          {(plan.startDate || plan.endDate) && (
            <View style={s.datesRow}>
              <View style={s.dateChip}>
                <Text style={s.dateChipLabel}>开始时间</Text>
                <Text style={s.dateChipValue}>{formatDate(plan.startDate)}</Text>
              </View>
              <View style={s.dateChip}>
                <Text style={s.dateChipLabel}>结束时间</Text>
                <Text style={s.dateChipValue}>{formatDate(plan.endDate)}</Text>
              </View>
            </View>
          )}

          {/* 底部按钮行 */}
          <View style={s.planFooter}>
            {needsConfirm ? (
              <TouchableOpacity
                style={[s.confirmBtn, confirming && { opacity: 0.6 }]}
                onPress={() => onConfirmPlan && onConfirmPlan(plan)}
                disabled={confirming}
                activeOpacity={0.85}
              >
                {confirming
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
                }
                <Text style={s.confirmBtnText}>{confirming ? '确认中…' : '确认方案'}</Text>
              </TouchableOpacity>
            ) : plan.confirmedAt ? (
              <View style={{ flexDirection: 'row', flex: 1, gap: 8 }}>
                <View style={[s.consultBtn, { borderColor: colors.success + '60', flex: 1, backgroundColor: '#E8F5EF' }]}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={[s.consultBtnText, { color: colors.success }]}>已确认</Text>
                </View>
                <TouchableOpacity
                  style={[s.consultBtn, { borderColor: colors.primary + '60', flex: 1 }]}
                  activeOpacity={0.8}
                  onPress={() => onRenew && onRenew(plan)}
                >
                  <Ionicons name="refresh-outline" size={14} color={colors.primary} />
                  <Text style={[s.consultBtnText, { color: colors.primary }]}>续约</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.consultBtn, { borderColor: meta.color + '60', flex: 1 }]}
                activeOpacity={0.8}
                onPress={() => onConsult && onConsult(plan)}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={14} color={meta.color} />
                <Text style={[s.consultBtnText, { color: meta.color }]}>咨询健康管理师</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function ServicePlansScreen({ navigation }) {
  const { isDemo } = useAuth();
  const [plans, setPlans]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded]     = useState(null);
  const [confirmingPlanId, setConfirmingPlanId] = useState(null);

  // 任务详情弹窗
  const [detailModal, setDetailModal]       = useState(null); // { item, plan, meta }
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [completing, setCompleting]         = useState(false);

  // 方案确认弹窗
  const [planConfirmTarget, setPlanConfirmTarget] = useState(null); // plan

  const loadPlans = useCallback(async () => {
    try {
      const [res, annualRes] = await Promise.all([
        plansAPI.list().catch(() => ({ success: false, data: [] })),
        plansAPI.listAnnualMgmt().catch(() => ({ success: false, data: [] })),
      ]);

      // 将年度管理方案转换为统一展示格式
      const MODULE_NAME = {
        medical_treatment: '医疗问题解决', specialist_collab: '全专联合会诊',
        abnormal_followup: '异常复查提醒', vaccine: '疫苗接种',
        monitoring: '日常监测', lifestyle: '生活方式评估',
        medication: '药物服用', nutrition_supplement: '营养素补充',
        annual_checkup: '年度体检', functional_medicine: '功能医学检测',
        quarterly_eval: '季度评估',
      };
      // 字段标签映射
      const FIELD_LABEL = {
        visit_time: '就医时间', hospital: '就医/体检医院', department: '就诊科室',
        expert: '专家姓名', reason: '原因', coordinator: '协调专员',
        plan_time: '计划时间', plan_method: '方式', purpose: '目的',
        items: '项目', time: '时间', frequency: '频率',
        name: '名称', brand: '品牌', dose: '剂量',
        escort: '陪检服务', institution: '体检机构',
        chemical_name: '药品名', brand_name: '商品名',
        body_composition: '人体成分', diet_analysis: '膳食调研',
        assist: '就医协助', order_dept: '开单科室', order_expert: '开单专家',
        notes: '备注',
        // annual_checkup / functional_medicine 模块字段
        date: '计划时间', focus: '重点关注', staff: '评估人员',
        goal: '干预目标', plan: '干预计划',
        // monitoring / vaccine 模块字段
        other: '其他项目',
      };
      const INTERNAL_FIELDS = new Set(['notes']); // internal: true 字段，不对外显示
      const buildEntryNotes = (entry) => {
        const lines = [];
        Object.entries(entry).forEach(([fk, fv]) => {
          if (fk === 'enabled' || fk === '_id' || INTERNAL_FIELDS.has(fk) || !fv || fv === false) return;
          const label = FIELD_LABEL[fk] || fk;
          const val = fv === true ? '是' : (Array.isArray(fv) ? fv.join('、') : String(fv));
          lines.push(`${label}：${val}`);
        });
        return lines.join('\n');
      };
      const buildNotes = (key, v) => {
        // v 直接是数组（历史格式或外层直接存数组）
        if (Array.isArray(v)) {
          return v.map((entry, i) => {
            const entryNotes = buildEntryNotes(entry);
            return v.length > 1 ? `【第${i + 1}项】\n${entryNotes}` : entryNotes;
          }).filter(Boolean).join('\n\n');
        }
        // multi:true 模块：数据存在 { records: [{...}, ...] } 里
        if (v.records && Array.isArray(v.records) && v.records.length > 0) {
          const recs = v.records;
          return recs.map((entry, i) => {
            const entryNotes = buildEntryNotes(entry);
            return recs.length > 1 ? `【第${i + 1}项】\n${entryNotes}` : entryNotes;
          }).filter(Boolean).join('\n\n');
        }
        // 普通对象：直接渲染顶层字段（跳过 records 字段避免 [object Object]）
        const lines = [];
        Object.entries(v).forEach(([fk, fv]) => {
          if (fk === 'enabled' || fk === 'records' || !fv || fv === false) return;
          const label = FIELD_LABEL[fk] || fk;
          const val = fv === true ? '是' : (Array.isArray(fv) ? fv.join('、') : String(fv));
          lines.push(`${label}：${val}`);
        });
        return lines.join('\n') || '';
      };

      const PLAN_TYPE_LABEL = {
        health_reshape: '健康重塑方案', young_state: '健康年轻态方案',
        chronic_stable: '慢病维稳方案', health_prevention: '健康预防方案',
      };
      const annualMgmtPlans = (annualRes.success && annualRes.data?.length > 0)
        ? annualRes.data.map(ap => ({
            _id: ap._id,
            title: `${ap.year}年 年度管理方案`,
            type: 'annual_mgmt',
            status: 'active',
            description: ap.planType ? (PLAN_TYPE_LABEL[ap.planType] || '') : '个人专属健康管理方案',
            staffId: ap.pushedBy,
            pushedAt: ap.pushedAt,
            year: ap.year,
            notes: ap.notes || '',
            confirmedAt: ap.confirmedAt || null,
            pushedAt: ap.pushedAt || null,
            items: Object.entries(ap.moduleData || {})
              .filter(([, v]) => v && (Array.isArray(v) ? v.length > 0 : v.enabled !== false))
              .map(([key, v]) => ({
                _id: key,
                name: MODULE_NAME[key] || key,
                notes: buildNotes(key, v),
                status: 'pending',
              })),
          }))
        : [];

      const healthPlans = (res.success && res.data?.length > 0) ? res.data : [];
      const allPlans = [...annualMgmtPlans, ...healthPlans];

      if (allPlans.length > 0) {
        setPlans(allPlans);
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

  const toggle = (id) => {
    setExpanded(prev => {
      const next = prev === id ? null : id;
      if (next) {
        plansAPI.view(next).catch(() => {});
        setPlans(prev2 => prev2.map(p =>
          p._id === next && !p.viewedAt ? { ...p, viewedAt: new Date().toISOString() } : p
        ));
      }
      return next;
    });
  };

  // ── 方案确认流程 ──────────────────────────────────────────────
  const handleConfirmPlan = (plan) => setPlanConfirmTarget(plan);

  const doConfirmPlan = async () => {
    if (!planConfirmTarget) return;
    const { _id, type } = planConfirmTarget;
    if (!String(_id).startsWith('demo')) {
      setConfirmingPlanId(_id);
      try {
        if (type === 'annual_mgmt') {
          await plansAPI.confirmAnnualMgmt(_id);
        } else {
          await plansAPI.confirm(_id);
        }
      } catch { /* 静默失败，乐观更新 */ }
      finally { setConfirmingPlanId(null); }
    }
    setPlans(prev => prev.map(p =>
      p._id === _id ? { ...p, confirmedAt: new Date().toISOString() } : p
    ));
    setPlanConfirmTarget(null);
  };

  // ── 咨询入口 ─────────────────────────────────────────────────
  const handleConsult = (plan) => {
    const hasStaff = plan.staffId?.name || plan.staffId;
    if (!hasStaff) {
      Alert.alert('提示', '您当前暂未分配健康管理师，请联系服务团队进行分配后再咨询。');
      return;
    }
    navigation.navigate('Messages');
  };

  // ── 任务项完成流程 ────────────────────────────────────────────
  const handleItemPress = (item, plan, meta) => setDetailModal({ item, plan, meta });

  const doCompleteItem = async () => {
    if (!detailModal) return;
    const { item, plan } = detailModal;
    if (!item._id || item.status === 'completed') { setConfirmVisible(false); return; }
    setCompleting(true);
    try {
      await plansAPI.completeItem(plan._id, item._id);
      setPlans(prev => prev.map(p => {
        if (p._id !== plan._id) return p;
        return { ...p, items: (p.items || []).map(it => it._id === item._id ? { ...it, status: 'completed' } : it) };
      }));
      setDetailModal(prev => prev ? { ...prev, item: { ...prev.item, status: 'completed' } } : null);
    } catch { /* 静默 */ }
    finally { setCompleting(false); setConfirmVisible(false); }
  };

  const isCompleted = detailModal?.item?.status === 'completed';
  const canComplete = detailModal?.item?._id && !isCompleted;

  return (
    <SafeAreaView style={s.container}>
      {/* 顶栏 */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.pageTitle}>健康方案</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPlans(); }} tintColor={colors.primary} />}
        >
          <View style={s.introCard}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={s.introText}>
              以下健康方案由您的医护团队为您定制并推送，请按方案完成各项健康管理任务。
            </Text>
          </View>

          {plans.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
              <Text style={s.emptyText}>暂无健康方案</Text>
              <Text style={s.emptySubText}>待医护团队为您制定并推送健康方案后{'\n'}将在此处显示</Text>
            </View>
          ) : (
            plans.map(plan => (
              <PlanCard
                key={plan._id}
                plan={plan}
                expanded={expanded === plan._id}
                onToggle={() => toggle(plan._id)}
                onItemPress={handleItemPress}
                onConfirmPlan={handleConfirmPlan}
                confirming={confirmingPlanId === plan._id}
                onConsult={handleConsult}
                onRenew={() => navigation.navigate('Renewal')}
              />
            ))
          )}
          <View style={{ height: spacing.xl }} />
        </ScrollView>
      )}

      {/* ── 任务项详情弹窗 ── */}
      <Modal visible={!!detailModal} transparent animationType="slide" onRequestClose={() => setDetailModal(null)}>
        <View style={s.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDetailModal(null)} />
          {detailModal && (() => {
            const { item, meta } = detailModal;
            const ism = ITEM_STATUS_META[item.status] || ITEM_STATUS_META.pending;
            return (
              <View style={s.modalCard}>
                <View style={s.handle} />
                <View style={s.modalHeader}>
                  <View style={[s.modalIconWrap, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={20} color={meta.color} />
                  </View>
                  <Text style={s.modalTitle} numberOfLines={2}>{item.name}</Text>
                  <View style={[s.modalStatus, { backgroundColor: ism.bg }]}>
                    <Text style={[s.modalStatusText, { color: ism.color }]}>{ism.label}</Text>
                  </View>
                </View>
                <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
                  <Text style={s.modalSectionLabel}>任务说明</Text>
                  {item.notes
                    ? <Text style={s.modalNotes}>{item.notes}</Text>
                    : <Text style={s.modalNoNotes}>暂无说明，请联系健康管理师了解详情。</Text>
                  }
                  {item.completedAt && (
                    <>
                      <Text style={s.modalSectionLabel}>完成时间</Text>
                      <Text style={s.modalNotes}>
                        {new Date(item.completedAt).toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </>
                  )}
                  <View style={{ height: spacing.md }} />
                </ScrollView>
                <View style={s.modalFooter}>
                  <TouchableOpacity style={s.modalCloseBtn} onPress={() => setDetailModal(null)}>
                    <Text style={s.modalCloseBtnText}>关闭</Text>
                  </TouchableOpacity>
                  {canComplete && (
                    <TouchableOpacity
                      style={[s.modalCompleteBtn, { backgroundColor: meta.color }]}
                      onPress={() => setConfirmVisible(true)}
                    >
                      <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
                      <Text style={s.modalCompleteBtnText}>标记已完成</Text>
                    </TouchableOpacity>
                  )}
                  {isCompleted && (
                    <View style={[s.modalCompleteBtn, { backgroundColor: colors.success + '20', flex: 2 }]}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                      <Text style={[s.modalCompleteBtnText, { color: colors.success }]}>已完成</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* ── 完成确认弹窗 ── */}
      <ConfirmModal
        visible={confirmVisible}
        title="确认完成"
        message={`确认已完成「${detailModal?.item?.name || ''}」？\n完成后将通知您的健康管理团队。`}
        confirmText="确认完成"
        confirmColor={colors.success}
        onConfirm={doCompleteItem}
        onCancel={() => setConfirmVisible(false)}
        loading={completing}
      />

      {/* ── 方案确认弹窗 ── */}
      <ConfirmModal
        visible={!!planConfirmTarget}
        title="确认健康方案"
        message={`确认接受「${planConfirmTarget?.title || ''}」？\n确认后方案将正式启动，您可按计划完成各项任务。`}
        confirmText="确认方案"
        confirmColor={colors.primary}
        onConfirm={doConfirmPlan}
        onCancel={() => setPlanConfirmTarget(null)}
        loading={confirmingPlanId === planConfirmTarget?._id}
      />
    </SafeAreaView>
  );
}
