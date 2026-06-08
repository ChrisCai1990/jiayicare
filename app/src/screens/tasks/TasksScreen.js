import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator,
  RefreshControl, Switch, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { tasksAPI, remindersAPI, followupTasksAPI } from '../../services/api';
import { mockTasks } from '../../data/mockData';
import { useAuth } from '../../context/AuthContext';
import EmptyState from '../../components/EmptyState';

// ── 优先级配置 ─────────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  high:   { label: '高', color: colors.danger,    bg: '#FDEEEC' },
  medium: { label: '中', color: colors.warning,   bg: '#FEF3E2' },
  low:    { label: '低', color: colors.textMuted, bg: colors.border },
};

const TYPE_META = {
  record:        { icon: 'clipboard-outline',       color: '#0077B6', bg: '#E3F2FB', label: '健康记录' },
  followup:      { icon: 'call-outline',             color: '#1E6B50', bg: '#E8F5EF', label: '随访任务' },
  questionnaire: { icon: 'document-text-outline',   color: '#7C3AED', bg: '#F2EEFF', label: '问卷' },
  checkup:       { icon: 'flask-outline',            color: '#D97706', bg: '#FEF3E2', label: '体检' },
  consultation:  { icon: 'chatbubbles-outline',      color: '#059669', bg: '#D1FAE5', label: '咨询' },
};
const DEFAULT_TYPE_META = { icon: 'clipboard-outline', color: colors.primary, bg: colors.primary + '12', label: '任务' };

// ── 提醒类别配置 ──────────────────────────────────────────────────
const CAT_META = {
  followup_abnormal: { label: '异常复查', icon: 'alert-circle-outline', color: '#DC3545', bg: '#FDEEEC' },
  medication:        { label: '用药',     icon: 'medical-outline',      color: '#0077B6', bg: '#EBF5FB' },
  supplement:        { label: '营养素',   icon: 'leaf-outline',         color: '#22A06B', bg: '#E8F5EF' },
  monitoring:        { label: '日常监测', icon: 'pulse-outline',        color: '#7C3AED', bg: '#F2EEFF' },
  screening_annual:  { label: '年度筛查', icon: 'search-outline',       color: '#D97706', bg: '#FEF3E2' },
  vaccination:       { label: '疫苗接种', icon: 'shield-outline',       color: '#059669', bg: '#D1FAE5' },
  diet_checkin:      { label: '饮食打卡', icon: 'nutrition-outline',    color: '#B45309', bg: '#FEF3C7' },
  exercise_checkin:  { label: '运动打卡', icon: 'fitness-outline',      color: '#0369A1', bg: '#E0F2FE' },
  weight_checkin:    { label: '体重打卡', icon: 'scale-outline',        color: '#1E6B50', bg: '#D1FAE5' },
  sleep:             { label: '入睡提醒', icon: 'moon-outline',         color: '#4F46E5', bg: '#EEF2FF' },
  substance:         { label: '烟酒提醒', icon: 'warning-outline',      color: '#9D174D', bg: '#FCE7F3' },
};

// ── 提醒时间描述 ──────────────────────────────────────────────────
function scheduleText(r) {
  if (r.scheduleType === 'once') {
    if (!r.targetDate) return '单次';
    const d = new Date(r.targetDate);
    return `${d.getMonth() + 1}/${d.getDate()} 单次`;
  }
  const time = r.reminderTime || '08:00';
  if (r.customEveryNDays) return `每${r.customEveryNDays}天 ${time}`;
  if (!r.daysOfWeek || r.daysOfWeek.length === 0) return `每天 ${time}`;
  const MAP = { Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四', Fri: '周五', Sat: '周六', Sun: '周日' };
  return r.daysOfWeek.map(d => MAP[d] || d).join('、') + ` ${time}`;
}

const FILTER_TABS = ['全部', '今日', '本周', '本月'];

// ── 样式 ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  pageTitle:    { fontSize: 24, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary + '12', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary + '30',
  },
  pendingBadgeText: { fontSize: 12, color: colors.primary, fontWeight: '600' },

  summary: {
    flexDirection: 'row', backgroundColor: colors.white,
    marginHorizontal: spacing.md, marginTop: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  summaryItem:   { flex: 1, alignItems: 'center' },
  summaryValue:  { fontSize: 22, fontWeight: '800' },
  summaryLabel:  { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  summaryDivider:{ width: 1, backgroundColor: colors.border, marginVertical: 4 },

  filterScroll: { paddingVertical: spacing.sm, maxHeight: 50, marginTop: spacing.sm },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  filterChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  filterText:       { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  filterTextActive: { color: colors.white, fontWeight: '600' },

  list: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },

  // ── 任务卡片 ──
  taskCard: {
    flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, alignItems: 'flex-start', ...shadow.sm,
  },
  taskCardCompleted: { opacity: 0.65 },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm, marginTop: 2, flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  taskBody:  { flex: 1 },
  taskRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  taskTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flex: 1, marginRight: 4 },
  taskTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  priorityText:  { fontSize: 10, fontWeight: '700' },
  taskDesc:  { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
  taskMeta:  { flexDirection: 'row', gap: spacing.md },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText:  { fontSize: 11, color: colors.textMuted },
  typeIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginLeft: spacing.xs,
  },

  // ── 提醒卡片 ──
  reminderCard: {
    flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, alignItems: 'center', ...shadow.sm,
  },
  reminderIcon:    { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, flexShrink: 0 },
  reminderBody:    { flex: 1 },
  reminderRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  reminderTitle:   { fontSize: 14, fontWeight: '600', color: colors.textPrimary, flex: 1, marginRight: 6 },
  catBadge:        { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full, flexShrink: 0 },
  catBadgeText:    { fontSize: 10, fontWeight: '700' },
  reminderSchedule:{ fontSize: 12, color: colors.textMuted },
  reminderDesc:    { fontSize: 11, color: colors.textSecondary, marginTop: 1 },

  // ── 已完成区块 ──
  completedSection: { marginTop: spacing.md },
  completedHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.xs, marginBottom: spacing.xs },
  completedHeaderText: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },

  // ── Skeleton ──
  loadingWrap:  { paddingTop: spacing.md },
  skeletonCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm },
  skeletonCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.border, marginRight: spacing.sm },
  skeletonLines:  { flex: 1 },
  skeletonLine:   { height: 12, borderRadius: 6, backgroundColor: colors.border },

  // ── 任务详情弹窗 ──
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingBottom: 32, maxHeight: '80%',
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
  modalIconWrap:   { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  modalTitle:      { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  modalPriorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  modalPriorityText:  { fontSize: 11, fontWeight: '700' },

  modalBody:         { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  modalSectionLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', marginBottom: 6, marginTop: spacing.sm },
  modalContent:      { fontSize: 13, color: colors.textSecondary, lineHeight: 20, backgroundColor: colors.background, borderRadius: radius.xs, padding: spacing.sm },
  modalNoContent:    { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },

  metaRow:   { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  metaChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.background, borderRadius: radius.xs, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  metaChipText: { fontSize: 12, color: colors.textSecondary },

  modalFooter:    { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  modalCloseBtn:  { flex: 1, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  modalCloseBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  modalCompleteBtn:  { flex: 2, paddingVertical: 11, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: colors.success },
  modalCompleteBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  modalDoneBtn:         { flex: 2, paddingVertical: 11, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: colors.success + '20' },
  modalDoneBtnText:     { fontSize: 14, fontWeight: '700', color: colors.success },
});

// ── 任务卡片 ─────────────────────────────────────────────────────
function TaskCard({ task, onToggle, onPress }) {
  const pConf = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.low;
  const tMeta = TYPE_META[task.type] || DEFAULT_TYPE_META;
  const isCompleted = task.status === 'completed';
  const id = task._id || task.id;

  return (
    <TouchableOpacity
      style={[styles.taskCard, isCompleted && styles.taskCardCompleted]}
      activeOpacity={0.8}
      onPress={() => !task.isReminder && onPress && onPress(task)}
    >
      {/* 勾选框（点击仅切换状态） */}
      <TouchableOpacity
        style={[styles.checkbox, isCompleted && styles.checkboxChecked]}
        onPress={(e) => { e.stopPropagation?.(); onToggle(id); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isCompleted && <Ionicons name="checkmark" size={14} color={colors.white} />}
      </TouchableOpacity>

      <View style={styles.taskBody}>
        <View style={styles.taskRow}>
          <Text style={[styles.taskTitle, isCompleted && styles.taskTitleDone]} numberOfLines={1}>
            {task.title}
          </Text>
          <View style={[styles.priorityBadge, { backgroundColor: pConf.bg }]}>
            <Text style={[styles.priorityText, { color: pConf.color }]}>{pConf.label}</Text>
          </View>
        </View>
        {!!task.description && (
          <Text style={styles.taskDesc} numberOfLines={1}>{task.description}</Text>
        )}
        <View style={styles.taskMeta}>
          {!!task.dueDate && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={12} color={colors.textMuted} />
              <Text style={styles.metaText}>{task.dueDate}{task.dueTime ? ' ' + task.dueTime : ''}</Text>
            </View>
          )}
          {!!task.assignee && (
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={12} color={colors.textMuted} />
              <Text style={styles.metaText}>{task.assignee}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.typeIconWrap, { backgroundColor: tMeta.bg }]}>
        <Ionicons name={tMeta.icon} size={18} color={tMeta.color} />
      </View>
    </TouchableOpacity>
  );
}

// ── 提醒卡片 ─────────────────────────────────────────────────────
function ReminderCard({ reminder, onToggle }) {
  const meta = CAT_META[reminder.category] || CAT_META.medication;
  return (
    <View style={styles.reminderCard}>
      <View style={[styles.reminderIcon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={22} color={meta.color} />
      </View>
      <View style={styles.reminderBody}>
        <View style={styles.reminderRow}>
          <Text style={styles.reminderTitle} numberOfLines={1}>{reminder.title}</Text>
          <View style={[styles.catBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.catBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <Text style={styles.reminderSchedule}>{scheduleText(reminder)}</Text>
        {!!reminder.description && (
          <Text style={styles.reminderDesc} numberOfLines={1}>{reminder.description}</Text>
        )}
      </View>
      <Switch
        value={reminder.enabled}
        onValueChange={() => onToggle(reminder._id)}
        trackColor={{ false: colors.border, true: colors.primary + '50' }}
        thumbColor={reminder.enabled ? colors.primary : colors.textMuted}
        ios_backgroundColor={colors.border}
        style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
      />
    </View>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function TasksScreen({ navigation }) {
  const { isDemo } = useAuth();
  const [filter, setFilter]       = useState('全部');
  const [tasks, setTasks]         = useState([]);
  const [reminders, setReminders] = useState([]);
  const [followupTasks, setFollowupTasks] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 任务详情弹窗
  const [detailTask, setDetailTask] = useState(null);
  const [completing, setCompleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [taskRes, remRes, fuRes] = await Promise.allSettled([
        tasksAPI.list(),
        remindersAPI.list(),
        followupTasksAPI.list(),
      ]);
      if (taskRes.status === 'fulfilled' && taskRes.value?.success) {
        setTasks(taskRes.value.data);
      } else {
        setTasks(isDemo ? mockTasks : []);
      }
      if (remRes.status === 'fulfilled' && remRes.value?.success) {
        setReminders(remRes.value.data);
      } else {
        setReminders([]);
      }
      if (fuRes.status === 'fulfilled' && fuRes.value?.success) {
        setFollowupTasks(fuRes.value.data || []);
      }
    } catch {
      setTasks(isDemo ? mockTasks : []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemo]);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = () => { setRefreshing(true); loadData(); };

  const toggleTask = async (id) => {
    const current = tasks.find(t => (t._id || t.id) === id);
    if (!current) return;
    const nextStatus = current.status === 'completed' ? 'pending' : 'completed';
    setTasks(prev => prev.map(t =>
      (t._id || t.id) === id
        ? { ...t, status: nextStatus, completedAt: nextStatus === 'completed' ? new Date().toISOString() : undefined }
        : t
    ));
    try {
      await tasksAPI.setStatus(id, nextStatus);
    } catch {
      setTasks(prev => prev.map(t => (t._id || t.id) === id ? { ...t, status: current.status } : t));
    }
  };

  const toggleReminder = async (id) => {
    setReminders(prev => prev.map(r => r._id === id ? { ...r, enabled: !r.enabled } : r));
    try {
      await remindersAPI.toggle(id);
    } catch {
      setReminders(prev => prev.map(r => r._id === id ? { ...r, enabled: !r.enabled } : r));
    }
  };

  // 从详情弹窗完成任务
  const handleCompleteFromModal = async () => {
    if (!detailTask || detailTask.status === 'completed') return;
    const id = detailTask._id || detailTask.id;
    setCompleting(true);
    const prev = detailTask;
    setDetailTask(t => ({ ...t, status: 'completed', completedAt: new Date().toISOString() }));
    setTasks(ts => ts.map(t => (t._id || t.id) === id ? { ...t, status: 'completed', completedAt: new Date().toISOString() } : t));
    try {
      await tasksAPI.complete(id);
    } catch {
      setDetailTask(prev);
      setTasks(ts => ts.map(t => (t._id || t.id) === id ? prev : t));
    } finally {
      setCompleting(false);
    }
  };

  const reminderToItem = (r) => ({
    _id: r._id, title: r.title, type: r.category || 'followup',
    description: r.description || '', dueDate: r.targetDate ? new Date(r.targetDate).toISOString().slice(0, 10) : null,
    dueTime: r.reminderTime || '', priority: r.category === 'followup_abnormal' ? 'high' : 'medium',
    status: 'pending', assignee: '', isReminder: true,
  });

  const followupToItem = (f) => ({
    _id: f._id,
    title: f.theme || '随访计划',
    type: 'followup',
    description: f.content || '',
    followupType: f.type || '',
    followupPeriod: f.followupPeriod || '',
    checkInItems: f.checkInItems || [],
    dueDate: f.date ? new Date(f.date).toISOString().slice(0, 10) : null,
    dueTime: '',
    priority: 'medium',
    status: f.status === 'completed' ? 'completed' : (f.status === 'in_progress' ? 'in_progress' : 'pending'),
    assignee: f.staffId?.name || '',
    isFollowup: true,
  });

  const pendingFollowups = followupTasks.filter(f => f.status !== 'completed' && f.status !== 'cancelled');
  const allItems     = [
    ...tasks.filter(t => t.status !== 'completed'),
    ...reminders.filter(r => r.enabled).map(reminderToItem),
    ...pendingFollowups.map(followupToItem),
  ];
  const completedItems = tasks.filter(t => t.status === 'completed');

  const today    = new Date().toISOString().slice(0, 10);
  const weekEnd  = new Date(Date.now() +  7 * 86400000).toISOString().slice(0, 10);
  const monthEnd = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const filteredTasks = (() => {
    if (filter === '今日') return [...tasks.filter(t => t.status !== 'completed' && (!t.dueDate || t.dueDate <= today)), ...reminders.filter(r => r.enabled && r.isActiveToday).map(reminderToItem)];
    if (filter === '本周') return allItems.filter(t => !t.dueDate || t.dueDate <= weekEnd);
    if (filter === '本月') return allItems.filter(t => !t.dueDate || t.dueDate <= monthEnd);
    return allItems;
  })();

  const pendingCount   = tasks.filter(t => t.status === 'pending').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const reminderCount  = reminders.filter(r => r.enabled && r.isActiveToday).length;

  const detailPConf = PRIORITY_CONFIG[detailTask?.priority] || PRIORITY_CONFIG.low;
  const detailTMeta = TYPE_META[detailTask?.type] || DEFAULT_TYPE_META;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {navigation?.canGoBack?.() && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4, marginLeft: -4 }}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.pageTitle}>待办任务</Text>
            <Text style={styles.pageSubtitle}>健康管理进度跟踪</Text>
          </View>
        </View>
        {filteredTasks.length > 0 && (
          <View style={styles.pendingBadge}>
            <Ionicons name="time-outline" size={13} color={colors.primary} />
            <Text style={styles.pendingBadgeText}>{filteredTasks.length} 项待办</Text>
          </View>
        )}
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        {[
          { val: allItems.length,    label: '全部待办',  color: colors.textPrimary },
          { val: reminderCount,      label: '今日提醒',  color: '#4F46E5' },
          { val: completedCount,     label: '已完成',    color: colors.success },
          { val: tasks.filter(t => t.priority === 'high' && t.status === 'pending').length, label: '高优先级', color: colors.danger },
        ].map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={styles.summaryDivider} />}
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: item.color }]}>{item.val}</Text>
              <Text style={styles.summaryLabel}>{item.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
        {FILTER_TABS.map(tab => (
          <TouchableOpacity key={tab} style={[styles.filterChip, filter === tab && styles.filterChipActive]} onPress={() => setFilter(tab)}>
            <Text style={[styles.filterText, filter === tab && styles.filterTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <ScrollView showsVerticalScrollIndicator={false} style={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {loading ? (
          <View style={styles.loadingWrap}>
            {[1, 2, 3].map(i => (
              <View key={i} style={styles.skeletonCard}>
                <View style={styles.skeletonCircle} />
                <View style={styles.skeletonLines}>
                  <View style={[styles.skeletonLine, { width: '70%' }]} />
                  <View style={[styles.skeletonLine, { width: '45%', marginTop: 8 }]} />
                </View>
              </View>
            ))}
          </View>
        ) : filteredTasks.length === 0 && completedItems.length === 0 ? (
          <EmptyState icon="checkmark-circle-outline" title="暂无待办任务" subtitle="您的健康管家会为您安排任务" color={colors.primary} />
        ) : (
          <>
            {filteredTasks.map(task => (
              task.isReminder
                ? <ReminderCard key={task._id} reminder={reminders.find(r => r._id === task._id) || task} onToggle={toggleReminder} />
                : <TaskCard key={task._id || task.id} task={task} onToggle={toggleTask} onPress={setDetailTask} />
            ))}
            {completedItems.length > 0 && (
              <View style={styles.completedSection}>
                <View style={styles.completedHeader}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={styles.completedHeaderText}>已完成 ({completedItems.length})</Text>
                </View>
                {completedItems.map(task => (
                  <TaskCard key={task._id || task.id} task={task} onToggle={toggleTask} onPress={setDetailTask} />
                ))}
              </View>
            )}
          </>
        )}
        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      {/* ── 任务详情弹窗 ── */}
      <Modal visible={!!detailTask} transparent animationType="slide" onRequestClose={() => setDetailTask(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDetailTask(null)} />
          {detailTask && (
            <View style={styles.modalCard}>
              <View style={styles.handle} />

              {/* 标题行 */}
              <View style={styles.modalHeader}>
                <View style={[styles.modalIconWrap, { backgroundColor: detailTMeta.bg }]}>
                  <Ionicons name={detailTMeta.icon} size={22} color={detailTMeta.color} />
                </View>
                <Text style={styles.modalTitle} numberOfLines={2}>{detailTask.title}</Text>
                <View style={[styles.modalPriorityBadge, { backgroundColor: detailPConf.bg }]}>
                  <Text style={[styles.modalPriorityText, { color: detailPConf.color }]}>{detailPConf.label}优先</Text>
                </View>
              </View>

              {/* 内容 */}
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* 元信息行 */}
                <View style={styles.metaRow}>
                  <View style={styles.metaChip}>
                    <Ionicons name="pricetag-outline" size={13} color={detailTMeta.color} />
                    <Text style={styles.metaChipText}>{detailTMeta.label}</Text>
                  </View>
                  {!!detailTask.dueDate && (
                    <View style={styles.metaChip}>
                      <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
                      <Text style={styles.metaChipText}>{detailTask.dueDate}{detailTask.dueTime ? ' ' + detailTask.dueTime : ''}</Text>
                    </View>
                  )}
                  {!!detailTask.assignee && (
                    <View style={styles.metaChip}>
                      <Ionicons name="person-outline" size={13} color={colors.textSecondary} />
                      <Text style={styles.metaChipText}>{detailTask.assignee}</Text>
                    </View>
                  )}
                </View>

                {/* 异常复查专属详情 */}
                {detailTask.abnormalReviewId && (() => {
                  const ar = detailTask.abnormalReviewId;
                  const SEVERITY = { mild: '轻度', moderate: '中度', severe: '重度' };
                  return (
                    <>
                      {!!ar.reviewReason && (
                        <>
                          <Text style={styles.modalSectionLabel}>复查原因</Text>
                          <Text style={styles.modalContent}>{ar.reviewReason}</Text>
                        </>
                      )}
                      {!!ar.reviewDate && (
                        <>
                          <Text style={styles.modalSectionLabel}>建议复查时间</Text>
                          <Text style={styles.modalContent}>{new Date(ar.reviewDate).toLocaleDateString('zh-CN')}</Text>
                        </>
                      )}
                      {!!ar.reviewHospital && (
                        <>
                          <Text style={styles.modalSectionLabel}>建议复查医院</Text>
                          <Text style={styles.modalContent}>{ar.reviewHospital}</Text>
                        </>
                      )}
                      {!!ar.reviewDepartment && (
                        <>
                          <Text style={styles.modalSectionLabel}>开单科室 / 专家</Text>
                          <Text style={styles.modalContent}>{ar.reviewDepartment}</Text>
                        </>
                      )}
                      {ar.abnormalItems?.length > 0 && (
                        <>
                          <Text style={styles.modalSectionLabel}>异常检查项目</Text>
                          {ar.abnormalItems.map((item, idx) => (
                            <View key={idx} style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#FFF5F5', borderRadius: 8, marginBottom: 6 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={{ color: '#DC3545', fontWeight: '600', fontSize: 14 }}>{item.name}</Text>
                                {!!item.severity && <Text style={{ fontSize: 11, color: '#DC3545', backgroundColor: '#FDEEEC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>{SEVERITY[item.severity] || item.severity}</Text>}
                              </View>
                              {!!item.value && <Text style={{ color: '#4A6558', fontSize: 13, marginTop: 2 }}>检测值：{item.value}{!!item.reference ? `（参考范围：${item.reference}）` : ''}</Text>}
                            </View>
                          ))}
                        </>
                      )}
                      {!!ar.notes && (
                        <>
                          <Text style={styles.modalSectionLabel}>注意事项</Text>
                          <Text style={styles.modalContent}>{ar.notes}</Text>
                        </>
                      )}
                    </>
                  );
                })()}

                {/* 随访任务专属详情 */}
                {detailTask.isFollowup && !detailTask.abnormalReviewId && (() => {
                  const FOLLOWUP_TYPE = { phone: '电话随访', wechat: '微信随访', visit: '上门随访', video: '视频随访', other: '其他随访' };
                  const FOLLOWUP_PERIOD = { biweekly: '双周随访', monthly: '月度随访', quarterly: '季度随访', annual: '年度随访' };
                  return (
                    <>
                      {!!detailTask.followupType && (
                        <>
                          <Text style={styles.modalSectionLabel}>随访方式</Text>
                          <Text style={styles.modalContent}>{FOLLOWUP_TYPE[detailTask.followupType] || detailTask.followupType}</Text>
                        </>
                      )}
                      {!!detailTask.followupPeriod && (
                        <>
                          <Text style={styles.modalSectionLabel}>随访周期</Text>
                          <Text style={styles.modalContent}>{FOLLOWUP_PERIOD[detailTask.followupPeriod] || detailTask.followupPeriod}</Text>
                        </>
                      )}
                      <Text style={styles.modalSectionLabel}>具体内容</Text>
                      {detailTask.description
                        ? <Text style={styles.modalContent}>{detailTask.description}</Text>
                        : <Text style={styles.modalNoContent}>健管师将在随访时与您沟通具体内容。</Text>
                      }
                      {!!(detailTask.checkInItems?.length) && (
                        <>
                          <Text style={styles.modalSectionLabel}>打卡项目</Text>
                          {detailTask.checkInItems.map((item, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                              <Text style={styles.modalContent}>{item}</Text>
                            </View>
                          ))}
                        </>
                      )}
                      {!!detailTask.assignee && (
                        <>
                          <Text style={styles.modalSectionLabel}>负责人员</Text>
                          <Text style={styles.modalContent}>{detailTask.assignee}</Text>
                        </>
                      )}
                    </>
                  );
                })()}

                {/* 普通任务描述 */}
                {!detailTask.abnormalReviewId && !detailTask.isFollowup && (
                  <>
                    <Text style={styles.modalSectionLabel}>任务描述</Text>
                    {detailTask.description
                      ? <Text style={styles.modalContent}>{detailTask.description}</Text>
                      : <Text style={styles.modalNoContent}>暂无详细描述，请联系健康管理师了解详情。</Text>
                    }
                  </>
                )}

                {detailTask.completedAt && (
                  <>
                    <Text style={styles.modalSectionLabel}>完成时间</Text>
                    <Text style={styles.modalContent}>
                      {new Date(detailTask.completedAt).toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </>
                )}
                <View style={{ height: spacing.md }} />
              </ScrollView>

              {/* 按钮行 */}
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDetailTask(null)}>
                  <Text style={styles.modalCloseBtnText}>关闭</Text>
                </TouchableOpacity>
                {detailTask.status !== 'completed' ? (
                  <TouchableOpacity
                    style={[styles.modalCompleteBtn, completing && { opacity: 0.6 }]}
                    onPress={handleCompleteFromModal}
                    disabled={completing}
                  >
                    {completing
                      ? <ActivityIndicator size="small" color={colors.white} />
                      : <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
                    }
                    <Text style={styles.modalCompleteBtnText}>{completing ? '处理中…' : '标记已完成'}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.modalDoneBtn}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={styles.modalDoneBtnText}>已完成</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
