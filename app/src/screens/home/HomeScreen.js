import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl,
  Modal,
} from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { userAPI, systemAPI, followupTasksAPI, tasksAPI } from '../../services/api';
import AnimatedNumber from '../../components/AnimatedNumber';

// 本地日期字符串（YYYY-MM-DD）——不能用 toISOString()，那是 UTC 日期，国内时区凌晨0-8点时
// 会比本地日期整整慢一天，导致"今天/昨天/前天"打卡归属日算错（2026-07-13 排查昨日打卡问题时发现）
function toLocalDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
import { HomeScreenSkeleton } from '../../components/SkeletonLoader';


// ── 迷你评分走势图 ────────────────────────────────────────────────
function ScoreTrendLine({ history }) {
  if (!history || history.length < 2) return null;
  const W = 80, H = 24;
  const scores = history.map(h => h.score);
  const min = Math.max(0,  Math.min(...scores) - 5);
  const max = Math.min(100, Math.max(...scores) + 5);
  const range = max - min || 1;
  const toX = (i) => (i / (scores.length - 1)) * W;
  const toY = (v) => H - ((v - min) / range) * H;
  const pts = scores.map((s, i) => `${toX(i)},${toY(s)}`).join(' ');
  const last = scores[scores.length - 1];
  return (
    <Svg width={W} height={H}>
      <Polyline points={pts} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={toX(scores.length - 1)} cy={toY(last)} r={3} fill="rgba(255,255,255,0.9)" />
    </Svg>
  );
}

// ── 任务优先级配置 ────────────────────────────────────────────────
const URGENCY_CONFIG = {
  high:   { label: '紧急', bg: '#FDECEA', color: '#DC3545' },
  medium: { label: '今天', bg: '#E8F5EF', color: '#1E6B50' },
  low:    { label: '即将', bg: '#F5F5F5', color: '#8AA89C' },
};

const TASK_ICON_CONFIG = {
  record:        { icon: 'heart-outline',      bg: '#FDECEA', color: '#DC3545' },
  followup:      { icon: 'call-outline',       bg: '#E8F5EF', color: '#1E6B50' },
  questionnaire: { icon: 'clipboard-outline',  bg: '#E8F3FB', color: '#0077B6' },
  checkup:       { icon: 'flask-outline',      bg: '#F2EEFF', color: '#7C3AED' },
  consultation:  { icon: 'chatbubbles-outline',bg: '#FDF0EB', color: '#D44000' },
};

// ── 提醒类别配置（首页用） ────────────────────────────────────────
const REM_CAT_META = {
  followup_abnormal: { icon: 'alert-circle-outline', color: '#DC3545', bg: '#FDEEEC' },
  medication:        { icon: 'medical-outline',       color: '#0077B6', bg: '#EBF5FB' },
  supplement:        { icon: 'leaf-outline',          color: '#22A06B', bg: '#E8F5EF' },
  monitoring:        { icon: 'pulse-outline',         color: '#7C3AED', bg: '#F2EEFF' },
  screening_annual:  { icon: 'search-outline',        color: '#D97706', bg: '#FEF3E2' },
  vaccination:       { icon: 'shield-outline',        color: '#059669', bg: '#D1FAE5' },
  diet_checkin:      { icon: 'nutrition-outline',     color: '#B45309', bg: '#FEF3C7' },
  exercise_checkin:  { icon: 'fitness-outline',       color: '#0369A1', bg: '#E0F2FE' },
  weight_checkin:    { icon: 'scale-outline',         color: '#1E6B50', bg: '#D1FAE5' },
  sleep:             { icon: 'moon-outline',          color: '#4F46E5', bg: '#EEF2FF' },
  substance:         { icon: 'warning-outline',       color: '#9D174D', bg: '#FCE7F3' },
};

// 打卡项目定义/生理指标字段/独立打卡页逻辑已抽离到 CheckinScreen.js（2026-07-18 打卡页重构）

// 主题关键词 → 打卡类型（兜底匹配，不依赖 checkInItems 字段）
function deriveCheckInFromTheme(theme) {
  const t = theme || '';
  const types = [];
  if (t.includes('血压')) types.push('bloodPressure');
  if (t.includes('血糖')) types.push('bloodSugar');
  if (t.includes('体重')) types.push('weight');
  if (t.includes('心率')) types.push('heartRate');
  if (t.includes('睡眠')) types.push('sleep');
  if (t.includes('生活') || t.includes('营养') || t.includes('饮食')) { types.push('diet'); types.push('water'); }
  if (t.includes('运动')) types.push('exercise');
  return types;
}

// ── 待办 Tab ──────────────────────────────────────────────────────
const TASK_TABS = ['全部', '今日', '本周', '本月'];

// ── 任务行 ────────────────────────────────────────────────────────
function TaskItem({ task, isLast, onPress }) {
  const urgency = URGENCY_CONFIG[task.priority] || URGENCY_CONFIG.low;
  const iconCfg = TASK_ICON_CONFIG[task.type] || TASK_ICON_CONFIG.followup;

  return (
    <TouchableOpacity
      style={[styles.taskItem, !isLast && styles.taskItemBorder]}
      activeOpacity={0.7}
      onPress={() => onPress && onPress(task)}
    >
      <View style={[styles.taskIconWrap, { backgroundColor: iconCfg.bg }]}>
        <Ionicons name={iconCfg.icon} size={20} color={iconCfg.color} />
      </View>
      <View style={styles.taskBody}>
        <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
        <Text style={styles.taskMeta} numberOfLines={1}>
          {task.assignee} · {task.dueDate} {task.dueTime}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={[styles.urgencyBadge, { backgroundColor: urgency.bg }]}>
          <Text style={[styles.urgencyText, { color: urgency.color }]}>{urgency.label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </View>
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

// ── 成长卡片（增长杠杆②：连续打卡激励 + 趋势正反馈）──────────────────
// 数据来自 dashboard 的 growth 字段。目的是给客户「连续记录」和「看到自己在变好」的正反馈，
// 提升打卡留存。无数据（从未打卡）时不渲染，不打扰新用户。
function GrowthCard({ growth, onCheckin }) {
  if (!growth) return null;
  const { streak = 0, totalCheckinDays = 0, monthCalendar = [], trendHighlight = null } = growth;
  // 从未打卡则不显示（新用户先引导打卡，不空谈成长）
  if (streak === 0 && totalCheckinDays === 0) return null;

  const today = new Date().getDate();
  return (
    <View style={{
      backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 16,
      shadowColor: '#1E6B50', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
    }}>
      {/* 连续天数 + 累计 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 20, marginRight: 6 }}>🔥</Text>
          <Text style={{ fontSize: 34, fontWeight: '800', color: '#1E6B50', lineHeight: 38 }}>{streak}</Text>
          <Text style={{ fontSize: 15, color: '#4A6558', fontWeight: '600', marginLeft: 4 }}>天连续打卡</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 12, color: '#8AA89C' }}>近30天累计</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1A2B24' }}>{totalCheckinDays} 天</Text>
        </View>
      </View>

      {/* 趋势亮点：你的 XX 在变好 */}
      {trendHighlight && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAF5EF',
          borderRadius: 12, padding: 10, marginTop: 14,
        }}>
          <Text style={{ fontSize: 16, marginRight: 8 }}>{trendHighlight.direction === 'up' ? '📈' : '📉'}</Text>
          <Text style={{ fontSize: 13, color: '#1E6B50', fontWeight: '600', flex: 1 }}>
            你的{trendHighlight.label}在变好：{trendHighlight.from}{trendHighlight.unit} → {trendHighlight.to}{trendHighlight.unit}
          </Text>
        </View>
      )}

      {/* 本月打卡日历（圆点） */}
      {monthCalendar.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>本月打卡</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {monthCalendar.map(d => (
              <View key={d.day} style={{
                width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                backgroundColor: d.checked ? '#1E6B50' : (d.future ? '#F3F4F6' : '#E8E1D5'),
                borderWidth: d.day === today ? 1.5 : 0, borderColor: '#D97706',
              }}>
                <Text style={{ fontSize: 9, color: d.checked ? '#fff' : '#B8AC99', fontWeight: '600' }}>{d.day}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 打卡入口已移除：打卡统一在下方「今日健康打卡」网格里进行，此处只做连续天数/日历的激励展示。
          （2026-07-10 金娟：原「坚持第N天·去打卡」按钮绑的是空函数 onCheckin={()=>{}}，点击无反应且与下方网格重复） */}
      {streak > 0 && (
        <Text style={{ marginTop: 12, textAlign: 'center', fontSize: 13, color: '#4A6558' }}>
          今天是坚持第 {streak + 1} 天，在下方完成今日打卡 👇
        </Text>
      )}
    </View>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const { user: authUser, isDemo } = useAuth();
  const [dashData, setDashData]             = useState(null);
  const [scoreHistory, setScoreHistory]     = useState([]);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [taskTab, setTaskTab]               = useState('全部');
  const [followupPlans, setFollowupPlans]   = useState([]);
  const [allTasks, setAllTasks]             = useState([]);
  // 打卡相关状态/弹窗已抽离到 CheckinScreen.js（2026-07-18 打卡页重构）
  const todayStr = toLocalDateStr(new Date());
  // 任务详情弹窗
  const [taskDetailModal, setTaskDetailModal] = useState(null);
  const [taskCompleting, setTaskCompleting]   = useState(false);
  const fileInputRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [dashRes, followupRes, tasksRes] =
        await Promise.allSettled([
          userAPI.getDashboard(),
          followupTasksAPI.list(),
          tasksAPI.list(),
        ]);

      if (dashRes.status === 'fulfilled' && dashRes.value?.success) {
        setDashData(dashRes.value.data);
        if (dashRes.value.data?.scoreHistory?.length > 0) {
          setScoreHistory(dashRes.value.data.scoreHistory);
        }
      }
      if (followupRes.status === 'fulfilled' && followupRes.value?.success) {
        setFollowupPlans(followupRes.value.data || []);
      }
      if (tasksRes.status === 'fulfilled' && tasksRes.value?.success) {
        setAllTasks((tasksRes.value.data || []).filter(t => t.status === 'pending'));
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
            new Notification('嘉医管家健康提醒', { body: res.pushed[0], icon: '/favicon.ico' });
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
  // has_any_health_data：后端返回，用于判断新用户空状态
  const hasAnyHealthData = dashData?.has_any_health_data ?? isDemo;
  const score = user?.healthScore || (isDemo ? 82 : 0);
  // 无健康数据时评分显示 "--"（文档#16：新用户不展示假分值）
  const scoreDisplay = hasAnyHealthData ? score : null;
  const name  = user?.name || '用户';

  // ── 真实最新指标 (fallback to mock) ──────────────────────────────
  // 注意：必须在 BMI 计算之前声明，避免 const TDZ 错误
  // 后端返回的是 HealthRecord 文档: { value: "130/80", extra: { sys, dia }, status }
  const vitals = dashData?.latestVitals || {};
  const bpRec  = vitals.bloodPressure;
  const bsSrc  = vitals.bloodSugar;

  // 健康管家团队展示已移至"我的"页（2026-07-18 首页瘦身），此处不再计算
  const hour  = new Date().getHours();
  const greeting   = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const statusEmoji = score >= 80 ? '✨' : score >= 60 ? '💪' : '🌱';
  const statusText  = score >= 80 ? '今天状态不错' : score >= 60 ? '继续保持' : '需要关注';

  // 趋势状态文案：把评分/指标异常转成一句能直接照做的行动建议，而不是抽象的"需关注"
  // 优先级：血压/血糖异常 > 评分下降趋势 > 评分平稳提示
  const trendActionText = (() => {
    if (bpStatusKey !== 'normal') return `血压${bpStatus.label}，建议今天测量并联系医师`;
    if (bsStatusKey !== 'normal') return `血糖${bsStatus.label}，建议今天复测并联系医师`;
    if (scoreHistory.length >= 2) {
      const first = scoreHistory[0]?.score, last = scoreHistory[scoreHistory.length - 1]?.score;
      if (first != null && last != null) {
        if (last - first <= -3) return `近${scoreHistory.length}日评分下降，建议关注近期生活方式`;
        if (last - first >= 3) return `近${scoreHistory.length}日评分上升，继续保持`;
      }
      return `近${scoreHistory.length}日趋势稳定`;
    }
    return null;
  })();

  // 血压/血糖状态：仅用于首页趋势文案判断（bpStatus/bsStatus），具体数值展示已移至健康档案页
  const bpStatusKey = bpRec?.status || 'normal';
  const bsStatusKey = bsSrc?.status || 'normal';

  const bpStatus = bpStatusKey === 'normal' ? { label: '正常', bg: '#E8F5EF', color: colors.success }
                 : bpStatusKey === 'low'    ? { label: '偏低', bg: '#EBF5FB', color: colors.info }
                 :                            { label: '偏高', bg: '#FDECEA', color: colors.danger };
  const bsStatus = bsStatusKey === 'normal' ? { label: '正常', bg: '#E8F5EF', color: colors.success }
                 : bsStatusKey === 'low'    ? { label: '偏低', bg: '#EBF5FB', color: colors.info }
                 :                            { label: '偏高', bg: '#FEF9E7', color: colors.warning };

  // 随访计划紧急程度：按实际日期与今天的差值动态算，不再写死"今天"
  // 逾期未随访=紧急，当天=今天，1-2天内=即将，更远=不特别标注（沿用即将样式）
  const urgencyByDate = (dateVal) => {
    if (!dateVal) return 'low'
    const diffDays = Math.floor((new Date(dateVal).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000)
    if (diffDays < 0) return 'high'
    if (diffDays === 0) return 'medium'
    return 'low'
  }

  // ── 合并待办：Task 表任务 + 随访计划（作为任务展示）─────────────
  // 已完成/已取消的随访（不管是用户自己标记完成，还是医护端执行随访后置为completed）都不再展示为待办，
  // 首页与"全部待办"页面（TasksScreen.js）保持同一口径，避免此前"医护端已完成但首页仍显示待办"的不一致。
  const allPendingTaskItems = [
    ...allTasks,
    ...followupPlans.filter(plan => !plan.completedByUser && !['completed', 'cancelled'].includes(plan.status)).map(plan => ({
      _id: plan._id,
      type: 'followup',
      title: plan.theme || '随访计划',
      description: plan.content,
      assignee: plan.staffId?.name || '医护团队',
      dueDate: plan.date
        ? new Date(plan.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
        : '',
      dueTime: '',
      priority: urgencyByDate(plan.date),
      followupType: plan.type,
      checkInItems: plan.checkInItems,
      formFields: plan.followUpSchemeId?.formId?.fields || [],
      formData: plan.formData || {},
    })),
  ];

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
            <Text style={styles.logo}>嘉医汇</Text>
            <Text style={styles.logoSub}>私人家庭医生，全生命周期健康管理</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarChip}
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.avatarInitial}>{name[0]}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>

          {/* ── 问候英雄卡 ────────────────────────────────────────── */}
          <View style={styles.heroCard}>
            <Text style={styles.heroGreeting}>{greeting}</Text>
            <Text style={styles.heroName}>
              {name}，{statusText} {statusEmoji}
            </Text>
            <View style={styles.heroScoreRow}>
              {scoreDisplay != null ? (
                <AnimatedNumber value={scoreDisplay} style={styles.heroScoreNum} duration={900} />
              ) : (
                <Text style={[styles.heroScoreNum, { color: 'rgba(255,255,255,0.4)' }]}>--</Text>
              )}
              <View style={styles.heroScoreMeta}>
                <Text style={styles.heroScoreLabel}>
                  {scoreDisplay != null ? '健康评分 / 100' : '暂无评分，请录入数据'}
                </Text>
                {scoreDisplay != null && (() => {
                  const grade = user?.healthScoreDetail?.grade || (scoreDisplay >= 90 ? '优' : scoreDisplay >= 75 ? '良' : scoreDisplay >= 60 ? '中' : '差')
                  const gradeColors = { '优': '#22A06B', '良': '#86EFAC', '中': '#FCD34D', '差': '#FCA5A5' }
                  return (
                    <Text style={{ fontSize: 13, fontWeight: '700', color: gradeColors[grade] || '#fff', marginTop: 2 }}>
                      {grade}
                    </Text>
                  )
                })()}
                {isDemo && <Text style={styles.heroScoreTrend}>↑ 较上月 +3 分</Text>}
              </View>
              {scoreDisplay != null && scoreHistory.length >= 2 && (
                <View style={styles.heroTrendLine}>
                  <ScoreTrendLine history={scoreHistory} />
                </View>
              )}
            </View>
            {trendActionText && (
              <Text style={styles.heroTrendActionText}>{trendActionText}</Text>
            )}
          </View>

          {/* ── 完成今日打卡（2026-07-18 打卡页重构）─────────────────
              原内联打卡网格/情绪打卡/健康指标已抽离到独立打卡页 CheckinScreen，
              首页只保留入口按钮，具体打卡逻辑与是否已完成的判断见该页。 */}
          <GrowthCard growth={dashData?.growth} onCheckin={() => {}} />
          <TouchableOpacity
            style={styles.checkinEntryBtn}
            onPress={() => navigation.navigate('Checkin')}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-done-outline" size={20} color={colors.white} />
            <Text style={styles.checkinEntryBtnText}>完成今日打卡</Text>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>


          {/* ── 待办任务 ──────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>待办任务</Text>
              <TouchableOpacity
                style={styles.sectionMore}
                onPress={() => navigation.navigate('Tasks')}
              >
                <Text style={styles.sectionMoreText}>全部</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.taskCard}>
              {allPendingTaskItems.length === 0 && todayReminders.length === 0 ? (
                <View style={styles.emptyTask}>
                  <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} />
                  <Text style={styles.emptyTaskText}>暂无待办任务</Text>
                </View>
              ) : (
                <>
                  {allPendingTaskItems.slice(0, 3).map((t, i, arr) => {
                    const isLast = i === arr.length - 1 && todayReminders.length === 0;
                    return <TaskItem key={t._id || t.id || i} task={t} isLast={isLast} onPress={setTaskDetailModal} />;
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
            {allPendingTaskItems.length > 3 && (
              <TouchableOpacity
                style={styles.reminderHint}
                onPress={() => navigation.navigate('Tasks')}
                activeOpacity={0.7}
              >
                <Ionicons name="ellipsis-horizontal-circle-outline" size={12} color={colors.primary} />
                <Text style={styles.reminderHintText}>还有 {allPendingTaskItems.length - 3} 项待办 · 查看全部</Text>
                <Ionicons name="chevron-forward" size={12} color={colors.primary} />
              </TouchableOpacity>
            )}
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

      {/* ── 任务详情弹窗 ────────────────────────────────────────── */}
      {taskDetailModal && (() => {
        const t = taskDetailModal;
        const iconCfg = TASK_ICON_CONFIG[t.type] || TASK_ICON_CONFIG.followup;
        const handleComplete = async () => {
          if (!t._id || t.type === 'followup') return;
          setTaskCompleting(true);
          try {
            await tasksAPI.complete(t._id);
            setAllTasks(prev => prev.filter(x => x._id !== t._id));
            setTaskDetailModal(null);
          } catch {}
          finally { setTaskCompleting(false); }
        };
        return (
          <Modal visible transparent animationType="slide" onRequestClose={() => setTaskDetailModal(null)}>
            <View style={styles.taskModalOverlay}>
              <View style={styles.taskModalCard}>
                <View style={styles.taskModalHandle} />
                <View style={styles.taskModalHeader}>
                  <View style={[styles.taskIconWrap, { backgroundColor: iconCfg.bg }]}>
                    <Ionicons name={iconCfg.icon} size={22} color={iconCfg.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskModalTitle}>{t.title}</Text>
                    <Text style={styles.taskModalMeta}>{t.assignee}{t.dueDate ? ` · ${t.dueDate}` : ''}{t.dueTime ? ` ${t.dueTime}` : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setTaskDetailModal(null)}>
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                {t.type === 'followup' ? (
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
                        <Text style={{ fontSize: 13, color: colors.textMuted, width: 64 }}>打卡项目</Text>
                        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {t.checkInItems.map((k, i) => (
                            <View key={i} style={{ backgroundColor: '#E8F5EF', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 }}>
                              <Text style={{ fontSize: 12, color: '#1E6B50' }}>
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
                ) : (
                  !!t.description && (
                    <Text style={styles.taskModalDesc}>{t.description}</Text>
                  )
                )}
                <View style={styles.taskModalFooter}>
                  <TouchableOpacity
                    style={styles.taskModalCancelBtn}
                    onPress={() => setTaskDetailModal(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.taskModalCancelText}>关闭</Text>
                  </TouchableOpacity>
                  {t.type !== 'followup' && (
                    <TouchableOpacity
                      style={[styles.taskModalCompleteBtn, taskCompleting && { opacity: 0.6 }]}
                      onPress={handleComplete}
                      disabled={taskCompleting}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
                      <Text style={styles.taskModalCompleteText}>标记已完成</Text>
                    </TouchableOpacity>
                  )}
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
  avatarInitial: { fontSize: 16, fontWeight: '700', color: colors.white },

  body: { paddingHorizontal: spacing.lg },

  // 问候英雄卡
  heroCard: {
    backgroundColor: '#1A2B24',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 4 },
  heroName: { fontSize: 20, fontWeight: '700', color: colors.white, marginBottom: spacing.md, letterSpacing: -0.3 },
  heroScoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroScoreNum: { fontSize: 56, fontWeight: '800', color: colors.white, lineHeight: 60, letterSpacing: -2 },
  heroScoreMeta: { gap: 4 },
  heroScoreLabel: { fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  heroScoreTrend: {
    fontSize: 12, color: colors.white, fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  heroTrendLine: { marginLeft: 'auto', alignItems: 'center', gap: 3 },
  heroTrendLabel: { fontSize: 9, color: 'rgba(255,255,255,0.45)' },
  heroTrendActionText: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: spacing.sm, lineHeight: 17 },

  // 完成今日打卡入口按钮（2026-07-18 打卡页重构：原网格/弹窗已抽离到 CheckinScreen）
  checkinEntryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg, ...shadow.sm,
  },
  checkinEntryBtnText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.white },

  // 通用 Section
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: colors.textMuted, marginBottom: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  sectionMore: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  sectionMoreText: { fontSize: 13, color: colors.primary, fontWeight: '500' },

  // 新用户引导卡
  onboardBanner: {
    marginBottom: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.primary + '30',
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

  // 今日待办 Tab
  taskTabRow: { flexDirection: 'row', gap: 4 },
  taskTab: {
    paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  taskTabActive: {
    backgroundColor: colors.primary, borderColor: colors.primary,
  },
  taskTabText: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
  taskTabTextActive: { color: colors.white },

  // 今日待办
  taskCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
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
  taskModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  taskModalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
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
  taskModalDesc: {
    fontSize: 14, color: colors.textSecondary, lineHeight: 21,
    backgroundColor: colors.background, borderRadius: radius.sm,
    padding: spacing.md, marginBottom: spacing.md,
  },
  taskModalFooter: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  taskModalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  taskModalCancelText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  taskModalCompleteBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  taskModalCompleteText: { fontSize: 14, color: colors.white, fontWeight: '700' },

  // 更多入口
  moreGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  moreItem: {
    width: '33.33%', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, gap: 6,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.borderLight,
  },
  moreLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
});
