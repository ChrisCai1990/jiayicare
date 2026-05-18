import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, Dimensions,
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Defs, LinearGradient, Stop, Polyline, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { userAPI, recordsAPI, systemAPI } from '../../services/api';
import AnimatedNumber from '../../components/AnimatedNumber';
import { HomeScreenSkeleton } from '../../components/SkeletonLoader';
import { mockBloodPressureData, mockBloodSugarData, mockTasks } from '../../data/mockData';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── 快捷服务配置 ─────────────────────────────────────────────────
const QUICK_SERVICES = [
  { icon: 'folder-open-outline',   label: '健康档案', color: '#0077B6', bg: '#E8F3FB', screen: 'Records' },
  { icon: 'medkit-outline',        label: '用药计划', color: '#D44000', bg: '#FDF0EB', screen: 'Medication' },
  { icon: 'hardware-chip-outline', label: 'AI 助手',  color: '#7C3AED', bg: '#F2EEFF', screen: 'Chat' },
];

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

// ── 固定颜色池 ───────────────────────────────────────────────────
const TEAM_COLORS = ['#1E6B50', '#0077B6', '#7C3AED', '#D44000'];

// ── 待办 Tab ──────────────────────────────────────────────────────
const TASK_TABS = ['今日', '本周', '本月'];

// ── Mini 折线图：血压 ─────────────────────────────────────────────
function BloodPressureChart({ data, onAdd }) {
  if (!data || data.length === 0) {
    return (
      <TouchableOpacity style={styles.chartEmptyMini} onPress={onAdd} activeOpacity={0.7}>
        <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
        <Text style={styles.chartEmptyMiniText}>点击录入血压</Text>
      </TouchableOpacity>
    );
  }
  const CARD_PADDING = spacing.md;
  const CARD_W = (SCREEN_WIDTH - spacing.lg * 2) / 2 - CARD_PADDING * 2;
  const Y_LABEL_W = 26;
  const CHART_W = CARD_W - Y_LABEL_W - 4;
  const CHART_H = 60;
  const X_LABEL_H = 14;
  const recent = data.slice(-7);
  const MIN_VAL = 60;
  const MAX_VAL = 170;
  const RANGE = MAX_VAL - MIN_VAL;
  const BAR_COUNT = recent.length;
  const BAR_TOTAL_W = CHART_W / BAR_COUNT;
  const BAR_W = Math.max(BAR_TOTAL_W * 0.5, 4);
  const toY = (v) => CHART_H - ((v - MIN_VAL) / RANGE) * CHART_H;
  const ref140Y = toY(140);
  const ref90Y  = toY(90);

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* Chart area */}
        <Svg width={CHART_W} height={CHART_H}>
          <Defs>
            <LinearGradient id="bpGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity="1" />
              <Stop offset="1" stopColor={colors.primary} stopOpacity="0.5" />
            </LinearGradient>
          </Defs>
          {/* Reference lines */}
          <Line x1={0} y1={ref140Y} x2={CHART_W} y2={ref140Y}
            stroke="#DC3545" strokeWidth={1} strokeDasharray="3,2" />
          <Line x1={0} y1={ref90Y} x2={CHART_W} y2={ref90Y}
            stroke="#22A06B" strokeWidth={1} strokeDasharray="3,2" />
          {/* Bars */}
          {recent.map((d, i) => {
            const barH = ((d.sys - MIN_VAL) / RANGE) * CHART_H;
            const x = i * BAR_TOTAL_W + (BAR_TOTAL_W - BAR_W) / 2;
            const isLast = i === recent.length - 1;
            return (
              <Rect
                key={i}
                x={x}
                y={CHART_H - barH}
                width={BAR_W}
                height={barH}
                rx={2}
                fill={isLast ? colors.primary : colors.primary}
                fillOpacity={isLast ? 1 : 0.4}
              />
            );
          })}
        </Svg>
        {/* Y-axis labels */}
        <View style={{ width: Y_LABEL_W, height: CHART_H, justifyContent: 'space-between', paddingLeft: 3 }}>
          <Text style={styles.chartAxisLabel}>160</Text>
          <Text style={styles.chartAxisLabel}>130</Text>
          <Text style={styles.chartAxisLabel}>90</Text>
        </View>
      </View>
      {/* X-axis labels */}
      <View style={{ width: CHART_W, flexDirection: 'row' }}>
        {recent.map((d, i) => (
          <View key={i} style={{ width: BAR_TOTAL_W, alignItems: 'center' }}>
            <Text style={styles.chartXLabel}>{d.date.slice(-4)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Mini 折线图：血糖 ─────────────────────────────────────────────
function BloodSugarChart({ data, onAdd }) {
  if (!data || data.length === 0) {
    return (
      <TouchableOpacity style={styles.chartEmptyMini} onPress={onAdd} activeOpacity={0.7}>
        <Ionicons name="add-circle-outline" size={18} color="#D97706" />
        <Text style={[styles.chartEmptyMiniText, { color: '#D97706' }]}>点击录入血糖</Text>
      </TouchableOpacity>
    );
  }
  const CARD_PADDING = spacing.md;
  const CARD_W = (SCREEN_WIDTH - spacing.lg * 2) / 2 - CARD_PADDING * 2;
  const Y_LABEL_W = 24;
  const CHART_W = CARD_W - Y_LABEL_W - 4;
  const CHART_H = 60;
  const recent = data.slice(-7);
  const MIN_VAL = 2;
  const MAX_VAL = 10;
  const RANGE = MAX_VAL - MIN_VAL;
  const BAR_COUNT = recent.length;
  const BAR_TOTAL_W = CHART_W / BAR_COUNT;
  const BAR_W = Math.max(BAR_TOTAL_W * 0.5, 4);
  const toY = (v) => CHART_H - ((v - MIN_VAL) / RANGE) * CHART_H;
  const ref61Y  = toY(6.1);
  const ref39Y  = toY(3.9);

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Svg width={CHART_W} height={CHART_H}>
          {/* Reference lines */}
          <Line x1={0} y1={ref61Y} x2={CHART_W} y2={ref61Y}
            stroke="#22A06B" strokeWidth={1} strokeDasharray="3,2" />
          <Line x1={0} y1={ref39Y} x2={CHART_W} y2={ref39Y}
            stroke="#0077B6" strokeWidth={1} strokeDasharray="3,2" />
          {/* Bars */}
          {recent.map((d, i) => {
            const barH = ((d.value - MIN_VAL) / RANGE) * CHART_H;
            const x = i * BAR_TOTAL_W + (BAR_TOTAL_W - BAR_W) / 2;
            const isLast = i === recent.length - 1;
            return (
              <Rect
                key={i}
                x={x}
                y={CHART_H - barH}
                width={BAR_W}
                height={barH}
                rx={2}
                fill="#F39C12"
                fillOpacity={isLast ? 1 : 0.4}
              />
            );
          })}
        </Svg>
        <View style={{ width: Y_LABEL_W, height: CHART_H, justifyContent: 'space-between', paddingLeft: 3 }}>
          <Text style={styles.chartAxisLabel}>8</Text>
          <Text style={styles.chartAxisLabel}>6</Text>
          <Text style={styles.chartAxisLabel}>4</Text>
        </View>
      </View>
      <View style={{ width: CHART_W, flexDirection: 'row' }}>
        {recent.map((d, i) => (
          <View key={i} style={{ width: BAR_TOTAL_W, alignItems: 'center' }}>
            <Text style={styles.chartXLabel}>{d.date.slice(-4)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── BMI 色带进度条 ────────────────────────────────────────────────
function BmiBar({ value }) {
  const MIN = 15;
  const MAX = 35;
  const pct = Math.min(Math.max((value - MIN) / (MAX - MIN), 0), 1);
  const CARD_PADDING = spacing.md;
  const BAR_W = (SCREEN_WIDTH - spacing.lg * 2) / 2 - CARD_PADDING * 2;

  const segments = [
    { from: 15,   to: 18.5, color: '#60B8D4' },
    { from: 18.5, to: 24,   color: '#22A06B' },
    { from: 24,   to: 28,   color: '#F39C12' },
    { from: 28,   to: 35,   color: '#DC3545' },
  ];

  const markerX = pct * BAR_W;

  return (
    <View style={{ marginTop: 10 }}>
      <Svg width={BAR_W} height={20}>
        {segments.map((seg, i) => {
          const segX = ((seg.from - MIN) / (MAX - MIN)) * BAR_W;
          const segW = ((seg.to - MIN) / (MAX - MIN)) * BAR_W - segX;
          const isFirst = i === 0;
          const isLast  = i === segments.length - 1;
          return (
            <Rect
              key={i}
              x={segX}
              y={6}
              width={segW}
              height={8}
              rx={isFirst || isLast ? 4 : 0}
              fill={seg.color}
            />
          );
        })}
        {/* Marker */}
        <Rect x={markerX - 1.5} y={2} width={3} height={16} rx={1.5} fill="#1A2B24" />
      </Svg>
      <Text style={[styles.chartXLabel, { marginTop: 2 }]}>
        偏轻{'<'}18.5 / 正常 18.5-24 / 超重 24-28 / 肥胖{'>'}28
      </Text>
    </View>
  );
}

// ── 任务行 ────────────────────────────────────────────────────────
function TaskItem({ task, isLast }) {
  const urgency = URGENCY_CONFIG[task.priority] || URGENCY_CONFIG.low;
  const iconCfg = TASK_ICON_CONFIG[task.type] || TASK_ICON_CONFIG.followup;

  return (
    <TouchableOpacity style={[styles.taskItem, !isLast && styles.taskItemBorder]} activeOpacity={0.7}>
      <View style={[styles.taskIconWrap, { backgroundColor: iconCfg.bg }]}>
        <Ionicons name={iconCfg.icon} size={20} color={iconCfg.color} />
      </View>
      <View style={styles.taskBody}>
        <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
        <Text style={styles.taskMeta} numberOfLines={1}>
          {task.assignee} · {task.dueDate} {task.dueTime}
        </Text>
      </View>
      <View style={[styles.urgencyBadge, { backgroundColor: urgency.bg }]}>
        <Text style={[styles.urgencyText, { color: urgency.color }]}>{urgency.label}</Text>
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

// ── 主页面 ────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const { user: authUser, isDemo } = useAuth();
  const [dashData, setDashData]       = useState(null);
  const [scoreHistory, setScoreHistory] = useState([]);
  const [bpTrend, setBpTrend]       = useState([]);
  const [sugarTrend, setSugarTrend] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [taskTab, setTaskTab]       = useState('今日');
  const [moodScore, setMoodScore]   = useState(7);

  const loadData = useCallback(async () => {
    try {
      const [dashRes, bpRes, sugarRes] = await Promise.allSettled([
        userAPI.getDashboard(),
        recordsAPI.trend('bloodPressure'),
        recordsAPI.trend('bloodSugar'),
      ]);

      if (dashRes.status === 'fulfilled' && dashRes.value?.success) {
        setDashData(dashRes.value.data);
        if (dashRes.value.data?.scoreHistory?.length > 0) {
          setScoreHistory(dashRes.value.data.scoreHistory);
        }
      }
      if (bpRes.status === 'fulfilled' && bpRes.value?.data?.length > 0) {
        const raw = bpRes.value.data;
        const normalised = raw.map(r => ({
          date: r.date || new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
          sys:  r.sys  ?? r.extra?.sys  ?? parseFloat(r.value?.split('/')[0]) ?? 130,
          dia:  r.dia  ?? r.extra?.dia  ?? parseFloat(r.value?.split('/')[1]) ?? 80,
        }));
        if (normalised.length > 0) setBpTrend(normalised);
      } else if (isDemo) {
        setBpTrend(mockBloodPressureData);
      }
      if (sugarRes.status === 'fulfilled' && sugarRes.value?.data?.length > 0) {
        const raw = sugarRes.value.data;
        const normalised = raw.map(r => ({
          date:  r.date || new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
          value: parseFloat(r.value ?? r.extra?.value ?? 6.1),
        }));
        if (normalised.length > 0) setSugarTrend(normalised);
      } else if (isDemo) {
        setSugarTrend(mockBloodSugarData);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    loadData();
    // 系统推送检查：每天最多触发一次（localStorage 记录日期）
    try {
      const pushKey = 'jy_last_push';
      const today = new Date().toISOString().slice(0, 10);
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
  const allPendingTasks = dashData?.pendingTasks || (isDemo ? mockTasks.filter(t => t.status === 'pending') : []);
  const todayReminders  = dashData?.todayReminders || [];
  const score = user?.healthScore || (isDemo ? 82 : 0);
  const name  = user?.name || '用户';

  // ── 实时 BMI 计算 ─────────────────────────────────────────────
  const bmiVal = (user?.height && user?.weight)
    ? (user.weight / ((user.height / 100) ** 2)).toFixed(1)
    : null;
  const bmiStatus = bmiVal
    ? (parseFloat(bmiVal) < 18.5 ? { label: '偏轻', bg: '#EBF5FB', color: '#0077B6' }
      : parseFloat(bmiVal) < 24   ? { label: '正常', bg: '#E8F5EF', color: colors.success }
      : parseFloat(bmiVal) < 28   ? { label: '超重', bg: '#FEF3E2', color: '#D97706' }
      :                              { label: '肥胖', bg: '#FDECEA', color: colors.danger })
    : { label: '待记录', bg: '#F5F5F5', color: colors.textMuted };

  // ── 健康管家团队（真实数据）────────────────────────────────────
  const careTeam = [
    user?.doctor?.name  ? { name: user.doctor.name,  role: user.doctor.title  || '主治医师',  online: true,  bg: TEAM_COLORS[0] } : null,
    user?.manager?.name ? { name: user.manager.name, role: user.manager.title || '健康管家',  online: true,  bg: TEAM_COLORS[1] } : null,
  ].filter(Boolean);
  const hour  = new Date().getHours();
  const greeting   = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const statusEmoji = score >= 80 ? '✨' : score >= 60 ? '💪' : '🌱';
  const statusText  = score >= 80 ? '今天状态不错' : score >= 60 ? '继续保持' : '需要关注';

  // ── 真实最新指标 (fallback to mock) ──────────────────────────────
  // 后端返回的是 HealthRecord 文档: { value: "130/80", extra: { sys, dia }, status }
  const vitals = dashData?.latestVitals || {};
  const bpRec  = vitals.bloodPressure;
  const bsSrc  = vitals.bloodSugar;

  // 血压：优先 extra.sys/dia，否则解析 value 字符串
  const bpSys = bpRec?.extra?.sys ?? (bpRec?.value ? parseFloat(bpRec.value.split('/')[0]) : null);
  const bpDia = bpRec?.extra?.dia ?? (bpRec?.value ? parseFloat(bpRec.value.split('/')[1]) : null);
  const bpVal = bpRec ? `${bpSys} / ${bpDia}` : '--/--';
  const bpStatusKey = bpRec?.status || 'normal';

  // 血糖
  const bsVal = bsSrc?.value != null ? String(bsSrc.value) : '--';
  const bsStatusKey = bsSrc?.status || 'normal';

  const bpStatus = bpStatusKey === 'normal' ? { label: '正常', bg: '#E8F5EF', color: colors.success }
                 : bpStatusKey === 'low'    ? { label: '偏低', bg: '#EBF5FB', color: colors.info }
                 :                            { label: '偏高', bg: '#FDECEA', color: colors.danger };
  const bsStatus = bsStatusKey === 'normal' ? { label: '正常', bg: '#E8F5EF', color: colors.success }
                 : bsStatusKey === 'low'    ? { label: '偏低', bg: '#EBF5FB', color: colors.info }
                 :                            { label: '偏高', bg: '#FEF9E7', color: colors.warning };

  // 待办 Tab 过滤
  const filteredTasks = (() => {
    if (taskTab === '今日') return allPendingTasks.slice(0, allPendingTasks.length);
    if (taskTab === '本周') return allPendingTasks.slice(0, 5);
    return allPendingTasks;
  })();

  // 睡眠时长：优先使用真实记录，Demo 用户无记录时展示示例数据
  const sleepRec      = dashData?.latestVitals?.sleep;
  const sleepHours    = sleepRec ? parseFloat(sleepRec.value) : (isDemo ? 8.3 : null);
  const sleepBedTime  = isDemo ? '22:30' : '--:--';
  const sleepWakeTime = isDemo ? '06:45' : '--:--';
  const sleepLabel      = sleepHours == null ? '待录入'
    : sleepHours < 6  ? '不足' : sleepHours <= 8 ? '良好' : '充足';
  const sleepLabelColor = sleepHours == null ? colors.textMuted
    : sleepHours < 6  ? colors.danger : sleepHours <= 8 ? colors.success : '#0077B6';
  const sleepBg         = sleepHours == null ? '#F5F5F5'
    : sleepHours < 6  ? '#FDECEA' : sleepHours <= 8 ? '#E8F5EF' : '#EBF5FB';

  // 情绪标签
  const moodLabel      = moodScore >= 8 ? '愉快' : moodScore >= 6 ? '良好' : '较差';
  const moodLabelColor = moodScore >= 8 ? '#0077B6' : moodScore >= 6 ? colors.success : colors.warning;

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
              <AnimatedNumber value={score} style={styles.heroScoreNum} duration={900} />
              <View style={styles.heroScoreMeta}>
                <Text style={styles.heroScoreLabel}>健康评分 / 100</Text>
                {isDemo && <Text style={styles.heroScoreTrend}>↑ 较上月 +3 分</Text>}
              </View>
              {scoreHistory.length >= 2 && (
                <View style={styles.heroTrendLine}>
                  <ScoreTrendLine history={scoreHistory} />
                  <Text style={styles.heroTrendLabel}>近{scoreHistory.length}日走势</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── 新用户引导卡（无任何健康数据时显示） ────────────────── */}
          {!isDemo && !bpRec && !bsSrc && !sleepRec && (
            <View style={styles.onboardBanner}>
              <View style={styles.onboardHeader}>
                <Ionicons name="rocket-outline" size={20} color={colors.primary} />
                <Text style={styles.onboardTitle}>开始您的健康管理之旅</Text>
              </View>
              <Text style={styles.onboardSub}>完成以下步骤，激活个人健康档案</Text>
              {[
                { icon: 'person-outline', label: '完善健康资料', done: !!(user?.height && user?.weight), screen: 'EditProfile' },
                { icon: 'add-circle-outline', label: '录入第一条健康数据', done: false, screen: 'AddRecord' },
                { icon: 'medical-outline', label: '咨询 AI 健康助手', done: false, screen: 'Chat' },
              ].map((step, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.onboardStep, step.done && styles.onboardStepDone]}
                  onPress={() => !step.done && navigation.navigate(step.screen)}
                  activeOpacity={step.done ? 1 : 0.75}
                >
                  <View style={[styles.onboardStepIcon, step.done && { backgroundColor: '#E8F5EF' }]}>
                    <Ionicons name={step.done ? 'checkmark' : step.icon} size={15}
                      color={step.done ? colors.success : colors.primary} />
                  </View>
                  <Text style={[styles.onboardStepLabel, step.done && { color: colors.textMuted, textDecorationLine: 'line-through' }]}>
                    {step.label}
                  </Text>
                  {!step.done && <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── 健康指标区块 ──────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>健康指标</Text>
            <View style={styles.metricsGrid}>

              {/* 血压 */}
              <View style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <Text style={styles.metricCardTitle}>血压</Text>
                  <View style={[styles.statusBadge, { backgroundColor: bpStatus.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: bpStatus.color }]}>{bpStatus.label}</Text>
                  </View>
                </View>
                <View style={styles.metricValueRow}>
                  <Text style={styles.metricValue}>{bpVal}</Text>
                  <Text style={styles.metricUnit}>mmHg</Text>
                </View>
                <BloodPressureChart data={bpTrend} onAdd={() => navigation.navigate('AddRecord')} />
              </View>

              {/* 血糖 */}
              <View style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <Text style={styles.metricCardTitle}>血糖</Text>
                  <View style={[styles.statusBadge, { backgroundColor: bsStatus.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: bsStatus.color }]}>{bsStatus.label}</Text>
                  </View>
                </View>
                <View style={styles.metricValueRow}>
                  <Text style={styles.metricValue}>{bsVal}</Text>
                  <Text style={styles.metricUnit}>mmol/L</Text>
                </View>
                <BloodSugarChart data={sugarTrend} onAdd={() => navigation.navigate('AddRecord')} />
              </View>

              {/* BMI */}
              <View style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <Text style={styles.metricCardTitle}>BMI</Text>
                  <View style={[styles.statusBadge, { backgroundColor: bmiStatus.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: bmiStatus.color }]}>{bmiStatus.label}</Text>
                  </View>
                </View>
                <View style={styles.metricValueRow}>
                  <Text style={styles.metricValue}>{bmiVal ?? '--'}</Text>
                  <Text style={styles.metricUnit}>kg/m²</Text>
                </View>
                {bmiVal ? <BmiBar value={parseFloat(bmiVal)} /> : (
                  <TouchableOpacity style={styles.chartEmptyMini} onPress={() => navigation.navigate('EditProfile')} activeOpacity={0.7}>
                    <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                    <Text style={styles.chartEmptyMiniText}>完善身高体重</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 睡眠 */}
              <View style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <Text style={styles.metricCardTitle}>睡眠</Text>
                  <View style={[styles.statusBadge, { backgroundColor: sleepBg }]}>
                    <Text style={[styles.statusBadgeText, { color: sleepLabelColor }]}>{sleepLabel}</Text>
                  </View>
                </View>
                <View style={styles.sleepRow}>
                  <Text style={styles.sleepRowLabel}>入睡时间</Text>
                  <Text style={[styles.sleepRowValue, !sleepHours && { color: colors.textDisabled }]}>{sleepBedTime}</Text>
                </View>
                <View style={[styles.sleepRow, { borderTopWidth: 1, borderTopColor: colors.borderLight }]}>
                  <Text style={styles.sleepRowLabel}>晨起时间</Text>
                  <Text style={[styles.sleepRowValue, !sleepHours && { color: colors.textDisabled }]}>{sleepWakeTime}</Text>
                </View>
                <View style={[styles.sleepRow, { borderTopWidth: 1, borderTopColor: colors.borderLight, marginTop: 2 }]}>
                  <Text style={styles.sleepRowLabel}>睡眠时长</Text>
                  {sleepHours != null ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.sleepRowValue, { color: colors.primary, fontWeight: '700' }]}>
                        {sleepHours} 小时
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => navigation.navigate('AddRecord')} activeOpacity={0.7}>
                      <Text style={[styles.sleepRowValue, { color: colors.primary, fontSize: 11 }]}>点击录入</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* 情绪 */}
              <View style={[styles.metricCard, styles.metricCardFull]}>
                <View style={styles.metricHeader}>
                  <Text style={styles.metricCardTitle}>情绪</Text>
                  <View style={[styles.statusBadge, { backgroundColor: moodScore >= 6 ? '#E8F5EF' : '#FDECEA' }]}>
                    <Text style={[styles.statusBadgeText, { color: moodLabelColor }]}>{moodLabel}</Text>
                  </View>
                </View>
                <View style={styles.metricValueRow}>
                  <Text style={styles.metricValue}>{moodScore}</Text>
                  <Text style={styles.metricUnit}>分</Text>
                </View>
                {/* 圆点选分 */}
                <View style={styles.moodDots}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <TouchableOpacity
                      key={n}
                      onPress={() => setMoodScore(n)}
                      activeOpacity={0.7}
                      style={[
                        styles.moodDot,
                        n === moodScore && styles.moodDotActive,
                      ]}
                    >
                      <Text style={[
                        styles.moodDotLabel,
                        n === moodScore && styles.moodDotLabelActive,
                      ]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.moodHint}>
                  6分以下 · 建议记录 | 6-8分 · 可选记录 | 8分以上 · 无需记录
                </Text>
              </View>

            </View>
          </View>

          {/* ── 快捷服务 ──────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>快捷服务</Text>
            <View style={styles.quickGrid}>
              {QUICK_SERVICES.map((item, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.quickItem}
                  onPress={() => navigation.navigate(item.screen)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.quickIconWrap, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={26} color={item.color} />
                  </View>
                  <Text style={styles.quickLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── 我的健康管家团队 ──────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>我的健康管家团队</Text>
            {careTeam.length === 0 ? (
              <View style={styles.teamEmpty}>
                <Ionicons name="people-outline" size={24} color={colors.textMuted} />
                <Text style={styles.teamEmptyText}>健管团队待分配，完成服务包开通后即可配置</Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.teamScrollContent}
              >
                {careTeam.map((member, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.teamCard}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('Chat')}
                  >
                    <View style={[styles.teamAvatar, { backgroundColor: member.bg }]}>
                      <Text style={styles.teamAvatarText}>{member.name[0]}</Text>
                      <View style={[styles.teamOnlineDot, { backgroundColor: member.online ? '#22A06B' : '#C0C0C0' }]} />
                    </View>
                    <Text style={styles.teamName}>{member.name}</Text>
                    <Text style={styles.teamRole}>{member.role}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* ── 今日待办 ──────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>今日待办</Text>
              <View style={styles.taskTabRow}>
                {TASK_TABS.map((tab) => (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.taskTab, taskTab === tab && styles.taskTabActive]}
                    onPress={() => setTaskTab(tab)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.taskTabText, taskTab === tab && styles.taskTabTextActive]}>
                      {tab}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.sectionMore}
                onPress={() => navigation.navigate('Tasks')}
              >
                <Text style={styles.sectionMoreText}>全部</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.taskCard}>
              {filteredTasks.length === 0 && todayReminders.length === 0 ? (
                <View style={styles.emptyTask}>
                  <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} />
                  <Text style={styles.emptyTaskText}>今日暂无待办</Text>
                </View>
              ) : (
                <>
                  {filteredTasks.map((t, i) => {
                    const isLast = i === filteredTasks.length - 1 && todayReminders.length === 0;
                    return <TaskItem key={t._id || t.id || i} task={t} isLast={isLast} />;
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

          {/* ── 更多入口 ──────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.moreGrid}>
              {[
                { icon: 'document-text-outline', label: '健康报告', color: colors.primary, screen: 'HealthReport' },
                { icon: 'notifications-outline', label: '提醒管理', color: colors.primary, screen: 'Reminders' },
                { icon: 'clipboard-outline',     label: '健康问卷', color: colors.primary, screen: 'Questionnaire' },
                { icon: 'cart-outline',          label: '服务商城', color: colors.primary, screen: 'ServiceMall' },
                { icon: 'cloud-upload-outline',  label: '上传报告', color: colors.primary, screen: 'ReportUpload' },
                { icon: 'add-circle-outline',    label: '记录数据', color: colors.primary, screen: 'AddRecord' },
              ].map((item, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.moreItem}
                  onPress={() => navigation.navigate(item.screen)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={item.icon} size={20} color={item.color} />
                  <Text style={styles.moreLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

        </View>
        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>
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

  // 通用 Section
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: colors.textMuted, marginBottom: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  sectionMore: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  sectionMoreText: { fontSize: 13, color: colors.primary, fontWeight: '500' },

  // 健康指标网格
  metricsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  metricCard: {
    width: (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm) / 2,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  metricCardFull: {
    width: '100%',
  },
  metricHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  metricCardTitle: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  statusBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  metricValue: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  metricUnit: { fontSize: 10, color: colors.textMuted, fontWeight: '500' },

  // 新用户引导卡
  onboardBanner: {
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
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

  // 图表轴标签
  chartAxisLabel: { fontSize: 8, color: colors.textMuted, lineHeight: 10 },
  chartXLabel: { fontSize: 7, color: colors.textMuted, lineHeight: 10 },
  chartEmptyMini: {
    marginTop: 10, height: 52, borderRadius: 8,
    backgroundColor: colors.primary05,
    borderWidth: 1, borderColor: colors.primary + '20', borderStyle: 'dashed',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  chartEmptyMiniText: { fontSize: 11, color: colors.primary, fontWeight: '600' },

  // 睡眠行
  sleepRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6,
  },
  sleepRowLabel: { fontSize: 11, color: colors.textSecondary },
  sleepRowValue: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },

  // 情绪圆点
  moodDots: {
    flexDirection: 'row', flexWrap: 'nowrap', gap: 5, marginTop: 10, justifyContent: 'space-between',
  },
  moodDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.borderLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  moodDotActive: {
    backgroundColor: colors.primary, borderColor: colors.primary,
  },
  moodDotLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  moodDotLabelActive: { color: colors.white },
  moodHint: {
    fontSize: 10, color: colors.textMuted, marginTop: 8, lineHeight: 14,
  },

  // 快捷服务
  quickGrid: {
    flexDirection: 'row', gap: spacing.sm,
  },
  quickItem: {
    flex: 1, alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: 18,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  quickIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  quickLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '600', textAlign: 'center' },

  // 健康管家团队
  teamEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  teamEmptyText: { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  teamScrollContent: { gap: spacing.sm, paddingVertical: 4 },
  teamCard: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight,
    minWidth: 88,
  },
  teamAvatar: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  teamAvatarText: { fontSize: 20, fontWeight: '700', color: colors.white },
  teamOnlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: colors.white,
  },
  teamName: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  teamRole: { fontSize: 10, color: colors.textMuted, fontWeight: '500' },

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
