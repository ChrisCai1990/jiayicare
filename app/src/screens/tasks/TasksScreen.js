import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { tasksAPI, remindersAPI } from '../../services/api';
import { mockTasks } from '../../data/mockData';
import { useAuth } from '../../context/AuthContext';
import EmptyState from '../../components/EmptyState';

// ── 优先级配置 ────────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  high:   { label: '高', color: colors.danger,   bg: '#FDEEEC' },
  medium: { label: '中', color: colors.warning,  bg: '#FEF3E2' },
  low:    { label: '低', color: colors.textMuted, bg: colors.border },
};

const TYPE_ICON = {
  record:        'clipboard',
  followup:      'call',
  questionnaire: 'document-text',
  checkup:       'flask',
  consultation:  'chatbubbles',
};

// ── 提醒类别配置 ───────────────────────────────────────────────────
const CAT_META = {
  followup_abnormal: { label: '异常复查', icon: 'alert-circle-outline', color: '#DC3545', bg: '#FDEEEC' },
  medication:        { label: '用药',     icon: 'medical-outline',       color: '#0077B6', bg: '#EBF5FB' },
  supplement:        { label: '营养素',   icon: 'leaf-outline',          color: '#22A06B', bg: '#E8F5EF' },
  monitoring:        { label: '日常监测', icon: 'pulse-outline',         color: '#7C3AED', bg: '#F2EEFF' },
  screening_annual:  { label: '年度筛查', icon: 'search-outline',        color: '#D97706', bg: '#FEF3E2' },
  vaccination:       { label: '疫苗接种', icon: 'shield-outline',        color: '#059669', bg: '#D1FAE5' },
  diet_checkin:      { label: '饮食打卡', icon: 'nutrition-outline',     color: '#B45309', bg: '#FEF3C7' },
  exercise_checkin:  { label: '运动打卡', icon: 'fitness-outline',       color: '#0369A1', bg: '#E0F2FE' },
  weight_checkin:    { label: '体重打卡', icon: 'scale-outline',         color: '#1E6B50', bg: '#D1FAE5' },
  sleep:             { label: '入睡提醒', icon: 'moon-outline',          color: '#4F46E5', bg: '#EEF2FF' },
  substance:         { label: '烟酒提醒', icon: 'warning-outline',       color: '#9D174D', bg: '#FCE7F3' },
};

// ── 提醒时间描述 ─────────────────────────────────────────────────
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

// ── 过滤 Tab ──────────────────────────────────────────────────────
const FILTER_TABS = ['全部', '今日', '本周', '本月'];

// ── 任务卡片 ──────────────────────────────────────────────────────
function TaskCard({ task, onToggle }) {
  const pConf = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.low;
  const isCompleted = task.status === 'completed';
  const id = task._id || task.id;

  return (
    <TouchableOpacity style={[styles.taskCard, isCompleted && styles.taskCardCompleted]}>
      <TouchableOpacity
        style={[styles.checkbox, isCompleted && styles.checkboxChecked]}
        onPress={() => onToggle(id)}
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
              <Text style={styles.metaText}>{task.dueDate} {task.dueTime}</Text>
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

      <View style={[styles.typeIcon, { backgroundColor: colors.primary + '12' }]}>
        <Ionicons name={TYPE_ICON[task.type] || 'clipboard'} size={18} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

// ── 提醒卡片 ──────────────────────────────────────────────────────
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
export default function TasksScreen() {
  const { isDemo } = useAuth();
  const [filter, setFilter]       = useState('全部');
  const [tasks, setTasks]         = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [taskRes, remRes] = await Promise.allSettled([
        tasksAPI.list(),
        remindersAPI.list(),
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
    } catch {
      setTasks(isDemo ? mockTasks : []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemo]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // 完成任务（乐观更新）
  const toggleTask = async (id) => {
    setTasks(prev => prev.map(t =>
      (t._id || t.id) === id ? { ...t, status: 'completed' } : t
    ));
    try {
      await tasksAPI.complete(id);
    } catch {
      setTasks(prev => prev.map(t =>
        (t._id || t.id) === id ? { ...t, status: 'pending' } : t
      ));
    }
  };

  // 切换提醒开关（乐观更新）
  const toggleReminder = async (id) => {
    setReminders(prev => prev.map(r =>
      r._id === id ? { ...r, enabled: !r.enabled } : r
    ));
    try {
      await remindersAPI.toggle(id);
    } catch {
      setReminders(prev => prev.map(r =>
        r._id === id ? { ...r, enabled: !r.enabled } : r
      ));
    }
  };

  // 将提醒转换为统一的待办条目
  const reminderToItem = (r) => ({
    _id: r._id,
    title: r.title,
    type: r.category || 'followup',
    description: r.description || '',
    dueDate: r.targetDate ? new Date(r.targetDate).toISOString().slice(0, 10) : null,
    dueTime: r.reminderTime || '',
    priority: r.category === 'followup_abnormal' ? 'high' : 'medium',
    status: 'pending',
    assignee: '',
    isReminder: true,
  });

  // 合并任务 + 提醒（仅待办）
  const allItems = [
    ...tasks.filter(t => t.status !== 'completed'),
    ...reminders.filter(r => r.enabled).map(reminderToItem),
  ];

  // 已完成任务
  const completedItems = tasks.filter(t => t.status === 'completed');

  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const monthEnd = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const filteredTasks = (() => {
    if (filter === '今日') return [
      ...tasks.filter(t => t.status !== 'completed' && (!t.dueDate || t.dueDate <= today)),
      ...reminders.filter(r => r.enabled && r.isActiveToday).map(reminderToItem),
    ];
    if (filter === '本周') return allItems.filter(t => !t.dueDate || t.dueDate <= weekEnd);
    if (filter === '本月') return allItems.filter(t => !t.dueDate || t.dueDate <= monthEnd);
    return allItems; // 全部
  })();

  // 统计
  const pendingCount   = tasks.filter(t => t.status === 'pending').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const reminderCount  = reminders.filter(r => r.enabled && r.isActiveToday).length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>待办任务</Text>
          <Text style={styles.pageSubtitle}>健康管理进度跟踪</Text>
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
        ].map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={styles.summaryDivider} />}
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.summaryLabel}>{s.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
      >
        {FILTER_TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterChip, filter === tab && styles.filterChipActive]}
            onPress={() => setFilter(tab)}
          >
            <Text style={[styles.filterText, filter === tab && styles.filterTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
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
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            icon="checkmark-circle-outline"
            title="暂无待办任务"
            subtitle="您的健康管家会为您安排任务"
            color={colors.primary}
          />
        ) : (
          <>
            {filteredTasks.map(task => (
              <TaskCard
                key={task._id || task.id}
                task={task}
                onToggle={task.isReminder ? () => {} : toggleTask}
              />
            ))}
            {filteredTasks.length === 0 && completedItems.length === 0 && (
              <EmptyState
                icon="checkmark-circle-outline"
                title="暂无待办任务"
                subtitle="您的健康管家会为您安排任务"
                color={colors.primary}
              />
            )}
            {completedItems.length > 0 && (
              <View style={styles.completedSection}>
                <View style={styles.completedHeader}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={styles.completedHeaderText}>已完成 ({completedItems.length})</Text>
                </View>
                {completedItems.map(task => (
                  <TaskCard
                    key={task._id || task.id}
                    task={task}
                    onToggle={() => {}}
                  />
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md, paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  pageTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.primary + '30',
  },
  pendingBadgeText: { fontSize: 12, color: colors.primary, fontWeight: '600' },

  summary: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },

  filterScroll: { paddingVertical: spacing.sm, maxHeight: 50, marginTop: spacing.sm },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  filterChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  filterText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  filterTextActive: { color: colors.white, fontWeight: '600' },
  filterDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#4F46E5',
  },

  list: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },

  listSectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: spacing.xs, marginTop: 4,
  },

  // Task card
  taskCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
    ...shadow.sm,
  },
  taskCardCompleted: { opacity: 0.65 },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm, marginTop: 2,
  },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  taskBody: { flex: 1 },
  taskRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  taskTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flex: 1, marginRight: 4 },
  taskTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  priorityText: { fontSize: 10, fontWeight: '700' },
  taskDesc: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
  taskMeta: { flexDirection: 'row', gap: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: colors.textMuted },
  typeIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: spacing.xs,
  },

  // Reminder card
  reminderCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
    ...shadow.sm,
  },
  reminderIcon: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm, flexShrink: 0,
  },
  reminderBody: { flex: 1 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  reminderTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, flex: 1, marginRight: 6 },
  catBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full, flexShrink: 0 },
  catBadgeText: { fontSize: 10, fontWeight: '700' },
  reminderSchedule: { fontSize: 12, color: colors.textMuted },
  reminderDesc: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },

  // Completed section
  completedSection: { marginTop: spacing.md },
  completedHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: spacing.xs, marginBottom: spacing.xs,
  },
  completedHeaderText: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },

  // Skeleton
  loadingWrap: { paddingTop: spacing.md },
  skeletonCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm,
  },
  skeletonCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.border, marginRight: spacing.sm },
  skeletonLines: { flex: 1 },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: colors.border },
});
