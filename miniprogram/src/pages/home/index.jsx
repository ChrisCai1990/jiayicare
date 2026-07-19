import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { userAPI, tasksAPI, followupTasksAPI, systemAPI } from '../../services/api';
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
        <Text style={{ fontSize: '12px', color: colors.textMuted, marginTop: '2px' }} numberOfLines={1}>{task.assignee} · {task.dueDate} {task.dueTime}</Text>
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
        {!!(task.dueDate || task.date) && <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', marginBottom: '8px' }}>时间：{task.dueDate || (task.date ? new Date(task.date).toLocaleDateString('zh-CN') : '')}</Text>}

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
                <Text style={{ fontSize: '13px', color: colors.textMuted, width: '64px' }}>打卡项目</Text>
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
  const { statusBarHeight } = useNavBar();
  const { user: authUser, isDemo } = useAuth();
  const [dashData, setDashData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskDetail, setTaskDetail] = useState(null);

  // 首屏关键数据：仪表盘/待办/随访，3个并发请求，尽快渲染出首页骨架
  // 今日打卡状态已随打卡网格一起抽离到独立页 pages/checkin/index（2026-07-18 打卡页重构对齐）
  // BMI色带/血压血糖迷你走势图已删除：app端首页瘦身后不再展示这两块，2026-07-19对齐删除
  const loadCore = useCallback(async () => {
    try {
      const [dashRes, tasksRes, followRes] = await Promise.allSettled([
        userAPI.getDashboard(),
        tasksAPI.list(),
        followupTasksAPI.list(),
      ]);
      if (dashRes.status === 'fulfilled' && dashRes.value?.success) setDashData(dashRes.value.data);
      if (tasksRes.status === 'fulfilled' && tasksRes.value?.success) {
        setTasks((tasksRes.value.data || []).filter((t) => t.status === 'pending'));
      }
      if (followRes.status === 'fulfilled' && followRes.value?.success) {
        setFollowups((followRes.value.data || []).filter((p) => !p.completedByUser && !['completed', 'cancelled'].includes(p.status)));
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
  const allPendingTaskItems = [
    ...tasks,
    ...followups.map((plan) => ({
      _id: plan._id,
      type: 'followup',
      title: plan.theme || '随访计划',
      description: plan.content,
      assignee: plan.staffId?.name || '医护团队',
      dueDate: plan.date ? new Date(plan.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '',
      dueTime: '',
      priority: urgencyByDate(plan.date),
      followupType: plan.type,
      checkInItems: plan.checkInItems,
      formFields: plan.followUpSchemeId?.formId?.fields || [],
      formData: plan.formData || {},
    })),
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
          <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.primary, display: 'block', letterSpacing: '-0.3px' }}>嘉医汇</Text>
          <Text style={{ fontSize: '10px', color: colors.textMuted, marginTop: '2px', letterSpacing: '0.2px' }}>私人家庭医生，全生命周期健康管理</Text>
        </View>
        <View
          style={{ width: '38px', height: '38px', borderRadius: '19px', backgroundColor: colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => Taro.switchTab({ url: '/pages/profile/index/index' })}
        >
          <Text style={{ fontSize: '16px', color: '#fff', fontWeight: 700 }}>{name[0]}</Text>
        </View>
      </View>

      <View style={{ padding: `0 ${spacing.lg}px` }}>
        {/* 问候卡：像素级对齐 app 端 HomeScreen.js heroCard（深墨绿背景#1A2B24、56px评分数字、等级/趋势标签/迷你走势线/行动建议） */}
        <View style={{ backgroundColor: '#1A2B24', borderRadius: `${radius.lg}px`, padding: `${spacing.lg}px`, marginBottom: `${spacing.md}px` }}>
          <Text style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)' }}>{greeting}</Text>
          <Text style={{ fontSize: '20px', fontWeight: 700, color: '#fff', display: 'block', marginTop: '4px', marginBottom: `${spacing.md}px` }}>
            {name}，{statusText} <Icon name={statusEmoji} size={18} color="#fff" />
          </Text>
          <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
            <Text style={{ fontSize: '56px', fontWeight: 800, color: '#fff', lineHeight: '60px', letterSpacing: '-2px' }}>
              {scoreDisplay != null ? scoreDisplay : '--'}
            </Text>
            <View style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
                {scoreDisplay != null ? '健康评分 / 100' : '暂无评分，请录入数据'}
              </Text>
              {scoreDisplay != null && (
                <Text style={{ fontSize: '13px', fontWeight: 700, color: gradeColors[grade] || '#fff' }}>{grade}</Text>
              )}
              {isDemo && (
                <Text style={{
                  fontSize: '12px', color: '#fff', fontWeight: 600, backgroundColor: 'rgba(255,255,255,0.18)',
                  padding: '3px 8px', borderRadius: `${radius.full}px`, display: 'inline-block',
                }}>↑ 较上月 +3 分</Text>
              )}
            </View>
            {scoreDisplay != null && scoreTrendPoints.length >= 2 && (
              <View style={{ marginLeft: 'auto', width: '80px' }}>
                <TrendChart points={scoreTrendPoints} height={24} color="rgba(255,255,255,0.7)" mini showValues={false} />
              </View>
            )}
          </View>
          {trendActionText && (
            <Text style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', marginTop: `${spacing.sm}px`, display: 'block', lineHeight: '17px' }}>{trendActionText}</Text>
          )}
        </View>

        {/* 成长打卡卡片：像素级对齐 app 端 GrowthCard 组件。从未打卡（streak=0且totalCheckinDays=0）时不渲染，
            新用户先引导打卡，不空谈成长——与app端一致 */}
        {(growth.streak > 0 || growth.totalCheckinDays > 0) && (
          <View style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '18px', marginBottom: '16px', boxShadow: '0px 4px 12px rgba(30,107,80,0.06)' }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ display: 'flex', alignItems: 'baseline' }}>
                <Icon name="🔥" size={20} color="#D97706" style={{ marginRight: '6px' }} />
                <Text style={{ fontSize: '34px', fontWeight: 800, color: colors.primary, lineHeight: '38px' }}>{growth.streak}</Text>
                <Text style={{ fontSize: '15px', color: '#4A6558', fontWeight: 600, marginLeft: '4px' }}>天连续打卡</Text>
              </View>
              <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <Text style={{ fontSize: '12px', color: colors.textMuted }}>近30天累计</Text>
                <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>{growth.totalCheckinDays} 天</Text>
              </View>
            </View>

            {!!growth.trendHighlight && (
              <View style={{ display: 'flex', alignItems: 'center', backgroundColor: '#EAF5EF', borderRadius: '12px', padding: '10px', marginTop: '14px' }}>
                <Icon name={growth.trendHighlight.direction === 'up' ? '📈' : '📉'} size={16} color={colors.primary} style={{ marginRight: '8px' }} />
                <Text style={{ fontSize: '13px', color: colors.primary, fontWeight: 600, flex: 1 }}>
                  你的{growth.trendHighlight.label}在变好：{growth.trendHighlight.from}{growth.trendHighlight.unit} → {growth.trendHighlight.to}{growth.trendHighlight.unit}
                </Text>
              </View>
            )}

            {growth.monthCalendar?.length > 0 && (
              <View style={{ marginTop: '14px' }}>
                <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: '8px' }}>本月打卡</Text>
                <View style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {growth.monthCalendar.map((d) => {
                    const isToday = d.day === new Date().getDate();
                    return (
                      <View key={d.day} style={{
                        width: '20px', height: '20px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: d.checked ? colors.primary : (d.future ? '#F3F4F6' : '#E8E1D5'),
                        border: isToday ? '1.5px solid #D97706' : 'none',
                      }}>
                        <Text style={{ fontSize: '9px', color: d.checked ? '#fff' : '#B8AC99', fontWeight: 600 }}>{d.day}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {growth.streak > 0 && (
              <Text style={{ marginTop: '12px', textAlign: 'center', fontSize: '13px', color: '#4A6558', display: 'block' }}>
                今天是坚持第 {growth.streak + 1} 天，点击上方按钮完成今日打卡 <Icon name="👆" size={13} color="#4A6558" />
              </Text>
            )}
          </View>
        )}

        {/* 完成今日打卡（2026-07-18 打卡页重构对齐）：原内联打卡网格已抽离到独立页 pages/checkin/index，
            首页只保留入口按钮，健康管家团队卡片已移至"我的"页 */}
        <View onClick={() => Taro.navigateTo({ url: '/pages/checkin/index' })} style={{
          display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: colors.primary,
          borderRadius: `${radius.lg}px`, padding: `${spacing.md}px ${spacing.lg}px`, marginBottom: `${spacing.lg}px`, boxShadow: shadow.sm,
        }}>
          <Icon name="✅" size={18} color="#fff" />
          <Text style={{ flex: 1, fontSize: '15px', fontWeight: 700, color: '#fff' }}>完成今日打卡</Text>
          <Text style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)' }}>›</Text>
        </View>

        {/* 待办任务：像素级对齐app端TaskItem/ReminderItem图标行+紧急度徽章，
            "随访"已移出Tab，"全部"入口跳转独立随访页（2026-07-18 Tab结构调整） */}
        <View style={{ marginBottom: `${spacing.lg}px` }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '10px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1.2px', textTransform: 'uppercase' }}>待办任务</Text>
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
                <Text style={{ fontSize: '14px', color: colors.textMuted }}>暂无待办任务</Text>
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
              <Text style={{ fontSize: '11px', color: colors.primary, fontWeight: 500, flex: 1 }}>还有 {allPendingTaskItems.length - 3} 项待办 · 查看全部</Text>
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

      </View>
      {/* 底部占位，对齐app端 <View style={{height: spacing.xl*2}}/> */}
      <View style={{ height: '64px' }} />

      {taskDetail && (
        <TaskDetailModal task={taskDetail} onClose={() => setTaskDetail(null)} onDone={markTaskDone} />
      )}
    </ScrollView>
  );
}
