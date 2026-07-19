import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { userAPI, systemAPI, followupTasksAPI } from '../../services/api';

// 本地日期字符串（YYYY-MM-DD）——不能用 toISOString()，那是 UTC 日期，国内时区凌晨0-8点时
// 会比本地日期整整慢一天，导致"今天/昨天/前天"打卡归属日算错（2026-07-13 排查昨日打卡问题时发现）
function toLocalDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
import { HomeScreenSkeleton } from '../../components/SkeletonLoader';

// ── 健康团队提醒：按随访人员角色分组（2026-07-19 由通用"待办任务"改造）───
// 数据源为当日随访计划（FollowUp），staffId/assignedTo 已在后端 populate 出 role 字段，
// 前端只需按 role 分桶展示，不做系统自动触发提醒（如"AI健康分析未查看"），本轮范围之外。
const TEAM_ROLE_CONFIG = {
  familyDoctor:  { label: '家庭医生', icon: 'medical-outline' },
  nutritionist:  { label: '营养师', icon: 'nutrition-outline' },
  healthManager: { label: '健康管理师', icon: 'people-outline' },
  medicalAssistant: { label: '就医专员', icon: 'briefcase-outline' },
  psychologist:  { label: '心理咨询师', icon: 'happy-outline' },
  rehabSpecialist: { label: '运动复健师', icon: 'fitness-outline' },
  tcmDoctor:     { label: '中医师', icon: 'leaf-outline' },
  specialist:    { label: '专科医师', icon: 'medkit-outline' },
  healthPlanner: { label: '健康规划师', icon: 'compass-outline' },
};
const DEFAULT_TEAM_ROLE = { label: '健康团队', icon: 'people-outline' };

// ── 提醒类别配置（首页用） ────────────────────────────────────────
const REM_CAT_META = {
  followup_abnormal: { icon: 'alert-circle-outline', color: '#E0605C', bg: 'rgba(224,96,92,0.14)' },
  medication:        { icon: 'medical-outline',       color: '#5B9BD5', bg: 'rgba(91,155,213,0.14)' },
  supplement:        { icon: 'leaf-outline',          color: '#4CAF7D', bg: 'rgba(76,175,125,0.14)' },
  monitoring:        { icon: 'pulse-outline',         color: '#A78BFA', bg: 'rgba(167,139,250,0.14)' },
  screening_annual:  { icon: 'search-outline',        color: '#E0A64B', bg: 'rgba(224,166,75,0.14)' },
  vaccination:       { icon: 'shield-outline',        color: '#4CAF7D', bg: 'rgba(76,175,125,0.14)' },
  diet_checkin:      { icon: 'nutrition-outline',     color: '#DDC28C', bg: 'rgba(221,194,140,0.14)' },
  exercise_checkin:  { icon: 'fitness-outline',       color: '#5B9BD5', bg: 'rgba(91,155,213,0.14)' },
  weight_checkin:    { icon: 'scale-outline',         color: '#C9A86A', bg: 'rgba(201,168,106,0.14)' },
  sleep:             { icon: 'moon-outline',          color: '#A78BFA', bg: 'rgba(167,139,250,0.14)' },
  substance:         { icon: 'warning-outline',       color: '#E0605C', bg: 'rgba(224,96,92,0.14)' },
};

// 打卡项目定义/生理指标字段/独立打卡页逻辑已抽离到 CheckinScreen.js（2026-07-18 打卡页重构）

// ── 健康团队提醒行：单条当日随访计划，展示所属角色 ────────────────────
function TeamReminderItem({ task, isLast, onPress }) {
  const roleCfg = TEAM_ROLE_CONFIG[task.role] || DEFAULT_TEAM_ROLE;
  return (
    <TouchableOpacity
      style={[styles.taskItem, !isLast && styles.taskItemBorder]}
      activeOpacity={0.7}
      onPress={() => onPress && onPress(task)}
    >
      <View style={[styles.taskIconWrap, { backgroundColor: colors.primary10 }]}>
        <Ionicons name={roleCfg.icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.taskBody}>
        <Text style={styles.taskMeta} numberOfLines={1}>{roleCfg.label}</Text>
        <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

// ── 提醒行（首页） ────────────────────────────────────────────────
function ReminderItem({ reminder, isLast }) {
  const meta = REM_CAT_META[reminder.category] || REM_CAT_META.medication;
  const time = reminder.reminderTime || '';
  return (
    <View style={[styles.taskItem, !isLast && styles.taskItemBorder]}>
      <View style={[styles.taskIconWrap, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={styles.taskBody}>
        <Text style={styles.taskTitle} numberOfLines={1}>{reminder.title}</Text>
        <Text style={styles.taskMeta} numberOfLines={1}>
          提醒{time ? ` · ${time}` : ''}
        </Text>
      </View>
      <View style={[styles.urgencyBadge, { backgroundColor: meta.bg }]}>
        <Text style={[styles.urgencyText, { color: meta.color }]}>提醒</Text>
      </View>
    </View>
  );
}

// ── 健康团队今日动态：家庭医生/营养师/健康管理师/AI健康分析/今日建议 ──────
const TEAM_ROW_CONFIG = [
  { key: 'doctor',          icon: 'medical-outline',        label: '家庭医生' },
  { key: 'nutritionist',    icon: 'nutrition-outline',      label: '营养师' },
  { key: 'healthManager',   icon: 'people-outline',         label: '健康管理师' },
  { key: 'aiSummary',       icon: 'analytics-outline',      label: 'AI健康分析' },
  { key: 'todaySuggestion', icon: 'sunny-outline',          label: '今日建议' },
];

function TeamInsightRow({ icon, label, content, isLast }) {
  return (
    <View style={[styles.teamRow, !isLast && styles.teamRowBorder]}>
      <View style={styles.teamRowIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.teamRowLabel}>{label}</Text>
        <Text style={styles.teamRowContent}>{content}</Text>
      </View>
    </View>
  );
}

function TeamInsightCard({ insights }) {
  return (
    <View style={styles.teamCard}>
      <Text style={styles.teamCardTitle}>您的健康团队已经开始今天的守护</Text>
      <Text style={styles.teamCardSubtitle}>我们正在关注</Text>
      {TEAM_ROW_CONFIG.map((cfg, i) => (
        <TeamInsightRow
          key={cfg.key}
          icon={cfg.icon}
          label={cfg.label}
          content={insights?.[cfg.key] || FALLBACK_INSIGHT_TEXT[cfg.key]}
          isLast={i === TEAM_ROW_CONFIG.length - 1}
        />
      ))}
    </View>
  );
}

const FALLBACK_INSIGHT_TEXT = {
  doctor: '暂无新的医疗风险',
  nutritionist: '暂无新的饮食建议',
  healthManager: '等待更新昨日健康数据',
  aiSummary: '数据较少，暂无明显趋势变化',
  todaySuggestion: '保持规律作息，坚持记录健康数据',
};

// ── 主页面 ────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const { user: authUser } = useAuth();
  const [dashData, setDashData]             = useState(null);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [followupPlans, setFollowupPlans]   = useState([]);
  // 打卡相关状态/弹窗已抽离到 CheckinScreen.js（2026-07-18 打卡页重构）
  const todayStr = toLocalDateStr(new Date());
  // 随访计划详情弹窗
  const [taskDetailModal, setTaskDetailModal] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [dashRes, followupRes] =
        await Promise.allSettled([
          userAPI.getDashboard(),
          followupTasksAPI.list(),
        ]);

      if (dashRes.status === 'fulfilled' && dashRes.value?.success) {
        setDashData(dashRes.value.data);
      }
      if (followupRes.status === 'fulfilled' && followupRes.value?.success) {
        setFollowupPlans(followupRes.value.data || []);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    loadData();
    // 系统推送检查：每天最多触发一次（localStorage 记录日期）
    try {
      const pushKey = 'jy_last_push';
      const today = toLocalDateStr(new Date());
      const lastPush = localStorage.getItem(pushKey);
      if (lastPush !== today) {
        systemAPI.push().then((res) => {
          localStorage.setItem(pushKey, today);
          // 若浏览器通知已授权且有新推送，弹出系统通知
          if (res?.pushed?.length > 0 && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('金伊森健康提醒', { body: res.pushed[0], icon: '/favicon.ico' });
          }
        }).catch(() => {}); // 静默失败，不影响首页加载
      }
    } catch {}
  }, [loadData]);

  // 从录入页返回时自动刷新（focus listener）
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      // 只在初次加载完成后才响应焦点刷新，避免首次双重请求
      if (!loading) loadData();
    });
    return unsub;
  }, [navigation, loading, loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // 合并两个来源：dashData 有服务器评分等，authUser 在编辑资料后立即更新（身高体重等）
  const user  = { ...(dashData?.user || {}), ...(authUser || {}) };
  const todayReminders  = dashData?.todayReminders || [];
  const name  = user?.name || '用户';

  // 健康管家团队展示已移至"我的"页（2026-07-18 首页瘦身），此处不再计算
  const hour  = new Date().getHours();
  const greeting   = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  // ── 健康团队提醒：当日随访计划，按角色分组（2026-07-19 由通用"待办任务"改造）───
  // 只展示"今天"的随访计划，不再混入用户手动创建的 Task；角色来自 staffId/assignedTo
  // populate 出的 Admin.role，取不到时归入"健康团队"兜底分组。
  const todayFollowupItems = followupPlans
    .filter(plan => !plan.completedByUser && !['completed', 'cancelled'].includes(plan.status))
    .filter(plan => plan.date && toLocalDateStr(new Date(plan.date)) === todayStr)
    .map(plan => ({
      _id: plan._id,
      type: 'followup',
      title: plan.theme || '随访计划',
      description: plan.content,
      role: plan.staffId?.role || plan.assignedTo?.role || null,
      assignee: plan.staffId?.name || plan.assignedTo?.name || '医护团队',
      dueDate: plan.date
        ? new Date(plan.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
        : '',
      dueTime: '',
      followupType: plan.type,
      checkInItems: plan.checkInItems,
      formFields: plan.followUpSchemeId?.formId?.fields || [],
      formData: plan.formData || {},
    }));

  if (loading) {
    return <SafeAreaView style={styles.container}><HomeScreenSkeleton /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ── 顶部 Logo 栏 ──────────────────────────────────────── */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.logo}>金伊森</Text>
            <Text style={styles.logoSub}>与远见者 · 共守健康</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarChip}
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.avatarInitial}>{name[0]}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>

          {/* ── 问候语（评分卡片已下线，改由健康团队今日动态承载状态信息）──── */}
          <View style={styles.greetingBlock}>
            <Text style={styles.heroGreeting}>{greeting}</Text>
            <Text style={styles.greetingName}>{name}</Text>
          </View>

          {/* ── 健康团队今日动态：家庭医生/营养师/健康管理师/AI健康分析/今日建议 ──── */}
          <TeamInsightCard insights={dashData?.dailyTeamInsights} />

          {/* ── 今日健康计划入口（2026-07-19 由"打卡"改造为健康计划）───────
              原"连续打卡"成长卡片已移除；具体三大板块（今日建议完成/健康更新/今日变化）见 CheckinScreen。 */}
          <TouchableOpacity
            style={styles.checkinEntryBtn}
            onPress={() => navigation.navigate('Checkin')}
            activeOpacity={0.85}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.checkinEntryBtnText}>今日健康计划</Text>
              <Text style={styles.checkinEntryBtnSubtext}>完成今天的健康计划，预计约3分钟</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.background} />
          </TouchableOpacity>


          {/* ── 待办任务 ──────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>健康团队提醒</Text>
              <TouchableOpacity
                style={styles.sectionMore}
                onPress={() => navigation.navigate('Tasks')}
              >
                <Text style={styles.sectionMoreText}>全部</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.taskCard}>
              {todayFollowupItems.length === 0 && todayReminders.length === 0 ? (
                <View style={styles.emptyTask}>
                  <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} />
                  <Text style={styles.emptyTaskText}>今天暂无健康团队提醒</Text>
                </View>
              ) : (
                <>
                  {todayFollowupItems.map((t, i, arr) => {
                    const isLast = i === arr.length - 1 && todayReminders.length === 0;
                    return <TeamReminderItem key={t._id || i} task={t} isLast={isLast} onPress={setTaskDetailModal} />;
                  })}
                  {todayReminders.map((r, i) => (
                    <ReminderItem
                      key={r._id || i}
                      reminder={r}
                      isLast={i === todayReminders.length - 1}
                    />
                  ))}
                </>
              )}
            </View>
            {todayReminders.length > 0 && (
              <TouchableOpacity
                style={styles.reminderHint}
                onPress={() => navigation.navigate('Reminders')}
                activeOpacity={0.7}
              >
                <Ionicons name="notifications-outline" size={12} color={colors.primary} />
                <Text style={styles.reminderHintText}>今日 {todayReminders.length} 条提醒已合并 · 管理提醒</Text>
                <Ionicons name="chevron-forward" size={12} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {/* ── 我的健康管家团队已移至"我的"页（2026-07-18 首页瘦身）──── */}


        </View>
        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      {/* ── 随访计划详情弹窗 ────────────────────────────────────────── */}
      {taskDetailModal && (() => {
        const t = taskDetailModal;
        const roleCfg = TEAM_ROLE_CONFIG[t.role] || DEFAULT_TEAM_ROLE;
        return (
          <Modal visible transparent animationType="slide" onRequestClose={() => setTaskDetailModal(null)}>
            <View style={styles.taskModalOverlay}>
              <View style={styles.taskModalCard}>
                <View style={styles.taskModalHandle} />
                <View style={styles.taskModalHeader}>
                  <View style={[styles.taskIconWrap, { backgroundColor: colors.primary10 }]}>
                    <Ionicons name={roleCfg.icon} size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskModalTitle}>{t.title}</Text>
                    <Text style={styles.taskModalMeta}>{t.assignee}{t.dueDate ? ` · ${t.dueDate}` : ''}{t.dueTime ? ` ${t.dueTime}` : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setTaskDetailModal(null)}>
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
                    {!!t.followupType && (
                      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                        <Text style={{ fontSize: 13, color: colors.textMuted, width: 64 }}>随访方式</Text>
                        <Text style={{ fontSize: 13, color: colors.textPrimary, flex: 1 }}>
                          {{ phone: '电话随访', wechat: '微信随访', visit: '上门随访', video: '视频随访', other: '其他' }[t.followupType] || t.followupType}
                        </Text>
                      </View>
                    )}
                    {t.checkInItems?.length > 0 && (
                      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                        <Text style={{ fontSize: 13, color: colors.textMuted, width: 64 }}>记录项目</Text>
                        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {t.checkInItems.map((k, i) => (
                            <View key={i} style={{ backgroundColor: colors.primary10, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 }}>
                              <Text style={{ fontSize: 12, color: colors.primary }}>
                                {{'diet':'饮食','exercise':'运动','sleep':'睡眠','alcohol':'烟酒','weight':'体重','bloodPressure':'血压','bloodSugar':'血糖','heartRate':'心率','water':'饮水'}[k] || k}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                    {!!t.description && (
                      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                        <Text style={{ fontSize: 13, color: colors.textMuted, width: 64 }}>备注</Text>
                        <Text style={{ fontSize: 13, color: colors.textPrimary, flex: 1 }}>{t.description}</Text>
                      </View>
                    )}
                    {t.formFields?.length > 0 && (
                      <View style={{ marginTop: 12 }}>
                        <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 12 }} />
                        {t.formFields.map((field, fi) => {
                          const val = t.formData?.[field.label];
                          const displayVal = Array.isArray(val) ? val.join('、') : (val ?? '—');
                          return (
                            <View key={fi} style={{ flexDirection: 'row', marginBottom: 10 }}>
                              <Text style={{ fontSize: 13, color: colors.textMuted, width: 80 }}>{field.label}</Text>
                              <Text style={{ fontSize: 13, color: colors.textPrimary, flex: 1 }}>{displayVal}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                    {!t.followupType && !t.checkInItems?.length && !t.description && !t.formFields?.length && (
                      <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: 8 }}>暂无详细内容</Text>
                    )}
                  </View>
                <View style={styles.taskModalFooter}>
                  <TouchableOpacity
                    style={[styles.taskModalCancelBtn, { flex: 1 }]}
                    onPress={() => setTaskDetailModal(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.taskModalCancelText}>关闭</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // 顶部 Logo 栏
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  logo: { fontSize: 22, fontWeight: '800', color: colors.primary, letterSpacing: -0.3 },
  logoSub: { fontSize: 10, color: colors.textMuted, marginTop: 2, letterSpacing: 0.2 },
  avatarChip: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 16, fontWeight: '700', color: colors.background },

  body: { paddingHorizontal: spacing.lg },

  // 问候语（评分卡片已下线）
  greetingBlock: { marginBottom: spacing.lg },
  heroGreeting: { fontSize: 14, color: colors.textMuted, marginBottom: 4 },
  greetingName: { fontSize: 22, fontWeight: '600', color: colors.textPrimary, letterSpacing: -0.1 },

  // 健康团队今日动态（磨砂玻璃卡片，内嵌5条动态）
  teamCard: {
    backgroundColor: colors.glass,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.glassBorder,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  teamCardTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, letterSpacing: 0.1 },
  teamCardSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md },
  teamRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 12 },
  teamRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  teamRowIcon: {
    width: 30, height: 30, borderRadius: 10, backgroundColor: colors.primary10,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  teamRowLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.3, marginBottom: 3 },
  teamRowContent: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },

  // 完成今日打卡入口按钮（2026-07-18 打卡页重构：原网格/弹窗已抽离到 CheckinScreen）
  checkinEntryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg, ...shadow.sm,
  },
  checkinEntryBtnText: { fontSize: 15, fontWeight: '700', color: colors.background },
  checkinEntryBtnSubtext: { fontSize: 12, color: colors.background, opacity: 0.75, marginTop: 2 },

  // 通用 Section
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: colors.textMuted, marginBottom: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  sectionMore: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  sectionMoreText: { fontSize: 13, color: colors.primary, fontWeight: '500' },

  // 新用户引导卡
  onboardBanner: {
    marginBottom: spacing.md,
    backgroundColor: colors.glass, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.glassBorder,
    padding: spacing.md, gap: spacing.xs,
  },
  onboardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  onboardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  onboardSub: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs },
  onboardStep: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: spacing.sm,
    backgroundColor: colors.background, borderRadius: radius.sm,
  },
  onboardStepDone: { opacity: 0.6 },
  onboardStepIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary10,
    alignItems: 'center', justifyContent: 'center',
  },
  onboardStepLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textPrimary },

  // 健康团队提醒（磨砂玻璃卡片）
  taskCard: {
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.glassBorder,
    overflow: 'hidden',
  },
  taskItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 14, gap: spacing.sm,
  },
  taskItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  taskIconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  taskBody: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  taskMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  urgencyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, flexShrink: 0 },
  urgencyText: { fontSize: 11, fontWeight: '700' },
  emptyTask: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyTaskText: { fontSize: 14, color: colors.textMuted },
  reminderHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 6, paddingHorizontal: 4,
  },
  reminderHintText: { fontSize: 11, color: colors.primary, flex: 1, fontWeight: '500' },

  // 任务详情弹窗
  taskModalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  taskModalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderColor: colors.glassBorder,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl,
  },
  taskModalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 16,
  },
  taskModalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  taskModalTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  taskModalMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  taskModalFooter: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  taskModalCancelBtn: {
    paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  taskModalCancelText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },

  // 更多入口
  moreGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.glassBorder,
    overflow: 'hidden',
  },
  moreItem: {
    width: '33.33%', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, gap: 6,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.borderLight,
  },
  moreLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
});
