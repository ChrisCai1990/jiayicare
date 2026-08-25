import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { userAPI, tasksAPI, followupTasksAPI, systemAPI, servicesAPI } from '../../services/api';
import TrendChart from '../../components/TrendChart';
import Icon from '../../components/Icon';
import useNavBar from '../../hooks/useNavBar';

// 对齐 app/src/screens/home/HomeScreen.js（2026-07-18 首页瘦身+打卡页重构后）：
// 打卡网格已抽离到独立页 pages/checkin/index，首页只保留入口按钮；健康管家团队卡片已移至"我的"页。
// 血压/血糖迷你走势图、BMI色带、成长打卡卡片（连续天数+月历）、任务详情弹窗均保留，接真实数据。
// 简化点：月历用简单圆点网格而非app端的日历UI组件；图标用emoji代替Ionicons图标名。

const URGENCY_CONFIG = {
  high:   { label: '紧急', bg: '#FDECEA', color: '#DC3545' },
  medium: { label: '今天', bg: '#E8F5EF', color: '#1E6B50' },
  low:    { label: '即将', bg: '#F5F5F5', color: '#8AA89C' },
};
const TASK_ICON_CONFIG = {
  record:        { icon: '❤️', bg: '#FDECEA' },
  followup:      { icon: '📞', bg: '#E8F5EF' },
  questionnaire: { icon: '📋', bg: '#E8F3FB' },
  checkup:       { icon: '🧪', bg: '#F2EEFF' },
  consultation:  { icon: '💬', bg: '#FDF0EB' },
};
const REM_CAT_META = {
  followup_abnormal: { icon: '⚠️', bg: '#FDEEEC' },
  medication:        { icon: '💊', bg: '#EBF5FB' },
  supplement:        { icon: '🌿', bg: '#E8F5EF' },
  monitoring:        { icon: '📈', bg: '#F2EEFF' },
  screening_annual:  { icon: '🔍', bg: '#FEF3E2' },
  vaccination:       { icon: '🛡️', bg: '#D1FAE5' },
  diet_checkin:      { icon: '🥗', bg: '#FEF3C7' },
  exercise_checkin:  { icon: '🏃', bg: '#E0F2FE' },
  weight_checkin:    { icon: '⚖️', bg: '#D1FAE5' },
  sleep:             { icon: '🌙', bg: '#EEF2FF' },
  substance:         { icon: '🚬', bg: '#FCE7F3' },
};
const FOLLOWUP_TYPE_LABEL = { phone: '电话随访', wechat: '微信随访', visit: '上门随访', video: '视频随访', other: '其他' };
const CHECKIN_ITEM_LABEL = { diet: '饮食', exercise: '运动', sleep: '睡眠', alcohol: '烟酒', weight: '体重', bloodPressure: '血压', bloodSugar: '血糖', heartRate: '心率', water: '饮水' };
const formatChineseDate = (value, includeYear = false) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${includeYear ? `${date.getFullYear()}年` : ''}${date.getMonth() + 1}月${date.getDate()}日`;
};
const displayTaskDate = (value) => {
  if (!value) return '';
  if (/\d+月\d+日/.test(String(value))) return String(value);
  return formatChineseDate(value);
};

// 随访计划紧急程度：按实际日期与今天的差值动态算（对齐app端urgencyByDate）
function urgencyByDate(dateVal) {
  if (!dateVal) return 'low';
  const diffDays = Math.floor((new Date(dateVal).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays < 0) return 'high';
  if (diffDays === 0) return 'medium';
  return 'low';
}

function TaskItemRow({ task, isLast, onPress }) {
  const urgency = URGENCY_CONFIG[task.priority] || URGENCY_CONFIG.low;
  const iconCfg = TASK_ICON_CONFIG[task.type] || TASK_ICON_CONFIG.followup;
  return (
    <View onClick={() => onPress(task)} style={{
      display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, padding: '14px 0',
      borderBottom: isLast ? 'none' : `1px solid ${colors.borderLight}`,
    }}>
      <View style={{ width: '44px', height: '44px', borderRadius: '13px', backgroundColor: iconCfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={iconCfg.icon} size={20} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }} numberOfLines={1}>{task.title}</Text>
        <Text style={{ fontSize: '12px', color: colors.textMuted, marginTop: '2px' }} numberOfLines={1}>{task.assignee} · {displayTaskDate(task.dueDate || task.date)} {task.dueTime}</Text>
      </View>
      <View style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <View style={{ padding: '4px 10px', borderRadius: `${radius.full}px`, backgroundColor: urgency.bg }}>
          <Text style={{ fontSize: '11px', fontWeight: 700, color: urgency.color }}>{urgency.label}</Text>
        </View>
        <Text style={{ fontSize: '14px', color: colors.textMuted }}>›</Text>
      </View>
    </View>
  );
}

function ReminderItemRow({ reminder, isLast }) {
  const meta = REM_CAT_META[reminder.category] || REM_CAT_META.medication;
  const time = reminder.reminderTime || '';
  return (
    <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, padding: '14px 0', borderBottom: isLast ? 'none' : `1px solid ${colors.borderLight}` }}>
      <View style={{ width: '44px', height: '44px', borderRadius: '13px', backgroundColor: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={meta.icon} size={20} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }} numberOfLines={1}>{reminder.title}</Text>
        <Text style={{ fontSize: '12px', color: colors.textMuted, marginTop: '2px' }} numberOfLines={1}>提醒{time ? ` · ${time}` : ''}</Text>
      </View>
      <View style={{ padding: '4px 10px', borderRadius: `${radius.full}px`, backgroundColor: meta.bg, flexShrink: 0 }}>
        <Text style={{ fontSize: '11px', fontWeight: 700, color: colors.textSecondary }}>提醒</Text>
      </View>
    </View>
  );
}

function TaskDetailModal({ task, onClose, onDone }) {
  const isFollowup = task.type === 'followup' || task._isFollowup;
  return (
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <View style={{ backgroundColor: '#fff', borderRadius: '24px 24px 0 0', padding: `${spacing.lg}px`, width: '100%', boxSizing: 'border-box', maxHeight: '80vh', overflowY: 'auto' }}>
        <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '0 auto 16px' }} />
        <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>{task.title || task.theme}</Text>
        {!!(task.assignee || task.staffId?.name) && <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', marginBottom: '4px' }}>负责人：{task.assignee || task.staffId?.name}</Text>}
        {!!(task.dueDate || task.date) && <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', marginBottom: '8px' }}>时间：{formatChineseDate(task.dueDate || task.date, true) || task.dueDate}</Text>}

        {isFollowup ? (
          <View>
            {!!task.followupType && (
              <View style={{ display: 'flex', marginBottom: '10px' }}>
                <Text style={{ fontSize: '13px', color: colors.textMuted, width: '64px' }}>随访方式</Text>
                <Text style={{ fontSize: '13px', color: colors.textPrimary, flex: 1 }}>{FOLLOWUP_TYPE_LABEL[task.followupType] || task.followupType}</Text>
              </View>
            )}
            {task.checkInItems?.length > 0 && (
              <View style={{ display: 'flex', marginBottom: '10px' }}>
                <Text style={{ fontSize: '13px', color: colors.textMuted, width: '64px' }}>记录项目</Text>
                <View style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {task.checkInItems.map((k, i) => (
                    <View key={i} style={{ backgroundColor: '#E8F5EF', padding: '3px 10px', borderRadius: `${radius.full}px` }}>
                      <Text style={{ fontSize: '12px', color: colors.primary }}>{CHECKIN_ITEM_LABEL[k] || k}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {!!task.description && (
              <View style={{ display: 'flex', marginBottom: '4px' }}>
                <Text style={{ fontSize: '13px', color: colors.textMuted, width: '64px' }}>备注</Text>
                <Text style={{ fontSize: '13px', color: colors.textPrimary, flex: 1 }}>{task.description}</Text>
              </View>
            )}
            {task.formFields?.length > 0 && (
              <View style={{ marginTop: '12px', borderTop: `1px solid ${colors.border}`, paddingTop: '12px' }}>
                {task.formFields.map((field, fi) => {
                  const val = task.formData?.[field.label];
                  const displayVal = Array.isArray(val) ? val.join('、') : (val ?? '—');
                  return (
                    <View key={fi} style={{ display: 'flex', marginBottom: '10px' }}>
                      <Text style={{ fontSize: '13px', color: colors.textMuted, width: '80px' }}>{field.label}</Text>
                      <Text style={{ fontSize: '13px', color: colors.textPrimary, flex: 1 }}>{displayVal}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          !!task.content && (
            <Text style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: '20px', display: 'block', marginBottom: `${spacing.md}px`, backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: `${spacing.md}px` }}>
              {task.content}
            </Text>
          )
        )}

        <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.md}px` }}>
          <View onClick={onClose} style={{ flex: 1, textAlign: 'center', padding: '12px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }}>
            <Text style={{ fontSize: '14px', color: colors.textSecondary, fontWeight: 600 }}>关闭</Text>
          </View>
          {!isFollowup && (
            <View onClick={onDone} style={{ flex: 2, textAlign: 'center', padding: '12px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary }}>
              <Text style={{ fontSize: '14px', color: '#fff', fontWeight: 700 }}>标记完成</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function HomePage() {
  Taro.useShareAppMessage(() => ({
    title: '嘉医汇｜全生命周期健康管理',
    path: `/pages/home/index${authUser?.referralCode ? `?invite=${authUser.referralCode}` : ''}`,
  }));
  Taro.useShareTimeline(() => ({
    title: '嘉医汇｜全生命周期健康管理',
  }));
  const { statusBarHeight } = useNavBar();
  const runtimeInfo = (() => {
    try {
      const info = Taro.getAccountInfoSync?.();
      return `${info?.miniProgram?.envVersion || 'unknown'} ${info?.miniProgram?.version || 'no-version'}`;
    } catch (_) {
      return 'unknown no-version';
    }
  })();
  const { user: authUser, isDemo } = useAuth();
  const [dashData, setDashData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskDetail, setTaskDetail] = useState(null);
  const [popularServices, setPopularServices] = useState([]);

  // 首屏关键数据：仪表盘/待办/随访，3个并发请求，尽快渲染出首页骨架
  // 今日打卡状态已随打卡网格一起抽离到独立页 pages/checkin/index（2026-07-18 打卡页重构对齐）
  // BMI色带/血压血糖迷你走势图已删除：app端首页瘦身后不再展示这两块，2026-07-19对齐删除
  const loadCore = useCallback(async () => {
    try {
      const [dashRes, tasksRes, followRes, servicesRes] = await Promise.allSettled([
        userAPI.getDashboard(),
        tasksAPI.list(),
        followupTasksAPI.list(),
        servicesAPI.list(),
      ]);
      if (dashRes.status === 'fulfilled' && dashRes.value?.success) setDashData(dashRes.value.data);
      if (tasksRes.status === 'fulfilled' && tasksRes.value?.success) {
        setTasks((tasksRes.value.data || []).filter((t) => t.status === 'pending'));
      }
      if (followRes.status === 'fulfilled' && followRes.value?.success) {
        setFollowups((followRes.value.data || []).filter((p) => !p.completedByUser && !['completed', 'cancelled'].includes(p.status)));
      }
      if (servicesRes.status === 'fulfilled' && servicesRes.value?.success) {
        setPopularServices((servicesRes.value.data?.services || []).slice(0, 4));
      }
    } catch {}
    setLoading(false);
  }, []);

  useDidShow(() => { loadCore(); });
  usePullDownRefresh(() => { loadCore().then(() => { Taro.stopPullDownRefresh(); }); });

  // systemAPI.push() 同理挪到首屏之后延迟触发，fire-and-forget，不参与启动阶段的并发请求
  useEffect(() => {
    const timer = setTimeout(() => { systemAPI.push().catch(() => {}); }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const user = { ...(dashData?.user || {}), ...(authUser || {}) };
  const hasData = dashData?.has_any_health_data ?? false;
  const score = user?.healthScore || 0;
  const scoreDisplay = hasData ? score : null;
  const name = user?.name || '用户';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const growth = dashData?.growth || { streak: 0, totalCheckinDays: 0, monthCalendar: [], trendHighlight: null };

  const statusEmoji = score >= 80 ? '✨' : score >= 60 ? '💪' : '🌱';
  const statusText = score >= 80 ? '今天状态不错' : score >= 60 ? '继续保持' : '需要关注';

  const scoreHistory = dashData?.scoreHistory || [];
  const grade = user?.healthScoreDetail?.grade || (score >= 90 ? '优' : score >= 75 ? '良' : score >= 60 ? '中' : '差');
  const gradeColors = { 优: '#22A06B', 良: '#86EFAC', 中: '#FCD34D', 差: '#FCA5A5' };
  const scoreTrendPoints = scoreHistory.map((h) => ({ label: h.date, value: h.score }));

  // 血压/血糖状态判断（仅用于首页趋势文案，具体数值展示在健康档案页）
  const vitals = dashData?.latestVitals || {};
  const bpStatusKey = vitals.bloodPressure?.status || 'normal';
  const bsStatusKey = vitals.bloodSugar?.status || 'normal';
  const bpLabel = bpStatusKey === 'normal' ? '正常' : bpStatusKey === 'low' ? '偏低' : '偏高';
  const bsLabel = bsStatusKey === 'normal' ? '正常' : bsStatusKey === 'low' ? '偏低' : '偏高';
  const trendActionText = (() => {
    if (bpStatusKey !== 'normal') return `血压${bpLabel}，建议今天测量并联系医师`;
    if (bsStatusKey !== 'normal') return `血糖${bsLabel}，建议今天复测并联系医师`;
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

  const todayReminders = dashData?.todayReminders || [];
  // 合并待办：Task表任务 + 随访计划（对齐app端allPendingTaskItems，同一口径过滤已完成/取消）
  const followupTaskItems = followups.map((plan) => ({
      _id: plan._id,
      type: 'followup',
      title: plan.sourceType === 'symptom' ? '不适主诉待健康顾问处理' : (plan.theme || '随访计划'),
      description: plan.taskRequirements || plan.plannedContent || plan.content,
      assignee: plan.assignedTo?.name || plan.staffId?.name || '医护团队',
      dueDate: formatChineseDate(plan.date),
      dueTime: '',
      priority: plan.sourceType === 'symptom' ? 'high' : urgencyByDate(plan.date),
      sourceType: plan.sourceType,
      followupType: plan.type,
      checkInItems: plan.checkInItems,
      formFields: plan.followUpSchemeId?.formId?.fields || [],
      formData: plan.formData || {},
    }));
  const allPendingTaskItems = [
    ...followupTaskItems.filter((item) => item.sourceType === 'symptom'),
    ...tasks,
    ...followupTaskItems.filter((item) => item.sourceType !== 'symptom'),
  ];

  const markTaskDone = async () => {
    if (!taskDetail) return;
    try {
      if (taskDetail._isFollowup) await followupTasksAPI.done(taskDetail._id, true, false);
      else await tasksAPI.complete(taskDetail._id);
      Taro.showToast({ title: '已完成', icon: 'success' });
      setTaskDetail(null);
      loadCore();
    } catch (e) {
      Taro.showToast({ title: e.message || '操作失败', icon: 'none' });
    }
  };

  return (
    <ScrollView scrollY style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      {/* 顶部Logo栏：像素级对齐app端topBar（22px logo/38x38 primary实心头像chip）。
          paddingTop加状态栏高度，因navigationStyle:custom后系统导航栏已隐藏，需自己避让胶囊按钮所在区域 */}
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.sm}px`, backgroundColor: colors.background }}>
        <View>
          <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.primary, display: 'block', letterSpacing: '-0.3px' }}>嘉医汇<Text style={{ fontSize: '8px', verticalAlign: 'top' }}>®</Text> | 嘉医管家</Text>
          <View style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <Text style={{ fontSize: '10px', color: colors.textMuted, letterSpacing: '0.2px' }}>健康有人管 · 生活更安心</Text>
            <Text style={{ fontSize: '8px', color: colors.textMuted }}>· {runtimeInfo}</Text>
          </View>
        </View>
        <View
          style={{ width: '38px', height: '38px', borderRadius: '19px', backgroundColor: colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => Taro.switchTab({ url: '/pages/profile/index/index' })}
        >
          <Text style={{ fontSize: '16px', color: '#fff', fontWeight: 700 }}>{name[0]}</Text>
        </View>
      </View>

      <View style={{ padding: `0 ${spacing.lg}px` }}>
        <View style={{ display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: '18px 18px', marginBottom: '12px', minHeight: '96px', boxShadow: shadow.card }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block' }}>{greeting}</Text>
            <Text style={{ fontSize: '18px', fontWeight: 750, color: colors.textPrimary, display: 'block', marginTop: '5px' }} numberOfLines={1}>{name}，{statusText}</Text>
            {trendActionText && <Text style={{ fontSize: '11px', color: colors.textSecondary, display: 'block', marginTop: '7px' }} numberOfLines={1}>{trendActionText}</Text>}
          </View>
          <View style={{ display: 'flex', alignItems: 'baseline', marginLeft: '10px' }}>
            <Text style={{ fontSize: '46px', fontWeight: 800, color: colors.textPrimary, lineHeight: '50px' }}>{scoreDisplay != null ? scoreDisplay : '--'}</Text>
            <Text style={{ fontSize: '12px', color: gradeColors[grade] || colors.primary, marginLeft: '5px' }}>{scoreDisplay != null ? `${grade} / 100` : '待录入'}</Text>
          </View>
        </View>

        {/* 成长打卡卡片：像素级对齐 app 端 GrowthCard 组件。从未打卡（streak=0且totalCheckinDays=0）时不渲染，
            新用户先引导打卡，不空谈成长——与app端一致 */}
        {(growth.streak > 0 || growth.totalCheckinDays > 0) && (
          <View style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '9px 13px', marginBottom: '8px', boxShadow: '0px 4px 12px rgba(30,107,80,0.06)' }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ display: 'flex', alignItems: 'baseline' }}>
                <Icon name="🔥" size={20} color="#D97706" style={{ marginRight: '6px' }} />
                <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.primary, lineHeight: '26px' }}>{growth.streak}</Text>
                <Text style={{ fontSize: '13px', color: '#4A6558', fontWeight: 600, marginLeft: '3px' }}>天连续记录</Text>
              </View>
              <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <Text style={{ fontSize: '10px', color: colors.textMuted }}>近30天累计</Text>
                <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>{growth.totalCheckinDays} 天</Text>
              </View>
            </View>

            {!!growth.trendHighlight && <Text style={{ marginTop: '4px', fontSize: '9px', color: colors.primary, display: 'block' }} numberOfLines={1}>↑ {growth.trendHighlight.label}在变好：{growth.trendHighlight.from}{growth.trendHighlight.unit} → {growth.trendHighlight.to}{growth.trendHighlight.unit}</Text>}
          </View>
        )}

        {/* 完成今日打卡（2026-07-18 打卡页重构对齐）：原内联打卡网格已抽离到独立页 pages/checkin/index，
            首页只保留入口按钮，健康管家团队卡片已移至"我的"页 */}
        <View onClick={() => Taro.navigateTo({ url: '/pages/checkin/index' })} style={{
          display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: '#fff',
          border: `2px solid ${colors.primary}`, borderRadius: `${radius.lg}px`, padding: '12px 16px', marginBottom: `${spacing.md}px`, boxShadow: shadow.sm,
        }}>
          <Icon name="✅" size={18} color={colors.primary} />
          <Text style={{ flex: 1, fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>健康数据记录</Text>
          <Text style={{ fontSize: '18px', letterSpacing: '-3px', color: colors.primary, fontWeight: 800 }}>›››</Text>
        </View>

        {/* 待办任务：像素级对齐app端TaskItem/ReminderItem图标行+紧急度徽章，
            "随访"已移出Tab，"全部"入口跳转独立随访页（2026-07-18 Tab结构调整） */}
        <View style={{ marginBottom: `${spacing.lg}px` }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '10px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1.2px', textTransform: 'uppercase' }}>健康计划</Text>
            <View onClick={() => Taro.navigateTo({ url: '/pages/tasks/index' })} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <Text style={{ fontSize: '13px', color: colors.primary, fontWeight: 500 }}>全部</Text>
              <Text style={{ fontSize: '13px', color: colors.primary }}>›</Text>
            </View>
          </View>
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden', padding: `0 ${spacing.md}px` }}>
            {loading ? (
              <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', padding: '20px 0', textAlign: 'center' }}>加载中...</Text>
            ) : (allPendingTaskItems.length === 0 && todayReminders.length === 0) ? (
              <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: `${spacing.xl}px 0`, gap: `${spacing.sm}px` }}>
                <Icon name="✅" size={32} color={colors.primary} />
                <Text style={{ fontSize: '14px', color: colors.textMuted }}>暂无健康计划</Text>
              </View>
            ) : (
              <>
                {allPendingTaskItems.slice(0, 3).map((t, i, arr) => (
                  <TaskItemRow key={t._id || i} task={t} isLast={i === arr.length - 1 && todayReminders.length === 0} onPress={setTaskDetail} />
                ))}
                {todayReminders.map((r, i) => (
                  <ReminderItemRow key={r._id || i} reminder={r} isLast={i === todayReminders.length - 1} />
                ))}
              </>
            )}
          </View>
          {allPendingTaskItems.length > 3 && (
            <View onClick={() => Taro.navigateTo({ url: '/pages/tasks/index' })} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', padding: '0 4px' }}>
              <Text style={{ fontSize: '12px', color: colors.primary }}>⋯</Text>
              <Text style={{ fontSize: '11px', color: colors.primary, fontWeight: 500, flex: 1 }}>还有 {allPendingTaskItems.length - 3} 项健康计划 · 查看全部</Text>
              <Text style={{ fontSize: '12px', color: colors.primary }}>›</Text>
            </View>
          )}
          {todayReminders.length > 0 && (
            <View onClick={() => Taro.navigateTo({ url: '/pages/reminders/index' })} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', padding: '0 4px' }}>
              <Icon name="🔔" size={12} color={colors.primary} />
              <Text style={{ fontSize: '11px', color: colors.primary, fontWeight: 500, flex: 1 }}>今日 {todayReminders.length} 条提醒已合并 · 管理提醒</Text>
              <Text style={{ fontSize: '12px', color: colors.primary }}>›</Text>
            </View>
          )}
        </View>

        <View style={{ marginBottom: `${spacing.lg}px` }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>常用健康服务</Text>
            <View onClick={() => Taro.navigateTo({ url: '/pages/services/mall/index' })}><Text style={{ fontSize: '12px', color: colors.primary }}>全部商城 ›</Text></View>
          </View>
          <ScrollView scrollX enhanced showScrollbar={false} style={{ width: '100%' }}>
            <View style={{ display: 'flex', gap: '8px', paddingBottom: '2px' }}>
              {popularServices.map((item) => (
                <View key={item.id} onClick={() => Taro.navigateTo({ url: '/pages/services/mall/index' })} style={{ width: '122px', flexShrink: 0, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: '10px', border: `1px solid ${colors.border}` }}>
                  <Icon name="🩺" size={17} color={colors.primary} />
                  <Text style={{ fontSize: '12px', lineHeight: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginTop: '5px', minHeight: '32px' }} numberOfLines={2}>{item.name}</Text>
                  <Text style={{ fontSize: '13px', fontWeight: 800, color: '#D97706', display: 'block', marginTop: '4px' }}>
                    {authUser ? `¥${item.price ?? '咨询'}` : '登录后查看'}
                  </Text>
                </View>
              ))}
              <View onClick={() => Taro.navigateTo({ url: '/pages/services/mall/index' })} style={{ width: '88px', flexShrink: 0, minHeight: '100px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="🛒" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontSize: '11px', fontWeight: 700, marginTop: '5px' }}>全部服务</Text>
              </View>
            </View>
          </ScrollView>
        </View>

      </View>
      {/* 底部占位，对齐app端 <View style={{height: spacing.xl*2}}/> */}
      <View style={{ height: '64px' }} />

      {taskDetail && (
        <TaskDetailModal task={taskDetail} onClose={() => setTaskDetail(null)} onDone={markTaskDone} />
      )}
    </ScrollView>
  );
}
