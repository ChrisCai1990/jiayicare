import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { userAPI, tasksAPI, followupTasksAPI, systemAPI } from '../../services/api';
import TrendChart from '../../components/TrendChart';
import Icon from '../../components/Icon';
import useNavBar from '../../hooks/useNavBar';
import logoFullTransparent from '../../assets/logo-full-transparent.png';

// 对齐 app/src/screens/home/HomeScreen.js（2026-07-18 首页瘦身+打卡页重构后）：
// 血压/血糖迷你走势图、BMI色带、成长打卡卡片（连续天数+月历）、任务详情弹窗均保留，接真实数据。
// 简化点：月历用简单圆点网格而非app端的日历UI组件；图标用emoji代替Ionicons图标名（常用工具宫格用SVG线性图标，见下方GRID_TOOLS）。
//
// 2026-07-19 首页视觉改版：从深色墨绿(#1A2B24)+暖米白背景，改为嘉医汇品牌青绿色系(浅色卡片风格)，
// 参照卓正医疗小程序的卡片化视觉语言重做。仅本页面局部换色，不改全局 theme/index.js
//（其余页面仍是金棕色深色主题），避免影响未改版页面。
// 改版要点：①logo栏改浅色底+真实品牌logo图，右侧预留胶囊按钮安全区 ②评分卡从深色通栏改浅青绿卡片，
// 头像入口挪到评分卡内部（不与胶囊按钮同排）③打卡卡片月历默认收起、按钮带打卡进度文案
// ④常用工具宫格改线性SVG图标 ⑤待办任务区块提到常用工具前面。
const hc = {
  teal900: '#0E3D38', teal700: '#147A6E', teal600: '#189485', teal500: '#1FAD9B', teal400: '#3DC2AF',
  teal100: '#E4F6F3', teal050: '#F1FAF8',
  bg: '#F4F8F7', surface: '#FFFFFF',
  text1: '#12211E', text2: '#56746E', text3: '#8FA8A3',
  border: '#E1EEEB', amber: '#D97706', danger: '#DC3545',
  shadowCard: '0px 4px 16px rgba(14,61,56,0.06)',
  radiusLg: '16px', radiusMd: '12px', radiusSm: '10px',
  capsuleSafeWidth: '90px',
};

const URGENCY_CONFIG = {
  high:   { label: '紧急', bg: '#FDECEA', color: hc.danger },
  medium: { label: '今天', bg: hc.teal100, color: hc.teal700 },
  low:    { label: '即将', bg: '#F5F5F5', color: hc.text3 },
};
// 图标名统一改用 Ionicons（与 app 端 <Ionicons name="..."/> 完全同款，2026-07-19 图标系统对齐）
const TASK_ICON_CONFIG = {
  record:        { icon: 'medical-outline', bg: '#FDECEA' },
  followup:      { icon: 'call-outline', bg: hc.teal100 },
  questionnaire: { icon: 'list-outline', bg: '#E8F3FB' },
  checkup:       { icon: 'flask-outline', bg: '#F2EEFF' },
  consultation:  { icon: 'chatbubble-outline', bg: '#FDF0EB' },
};
const REM_CAT_META = {
  followup_abnormal: { icon: 'alert-circle-outline', bg: '#FDEEEC' },
  medication:        { icon: 'medical-outline', bg: '#EBF5FB' },
  supplement:        { icon: 'leaf-outline', bg: hc.teal100 },
  monitoring:        { icon: 'pulse-outline', bg: '#F2EEFF' },
  screening_annual:  { icon: 'search-outline', bg: '#FEF3E2' },
  vaccination:       { icon: 'shield-outline', bg: '#D1FAE5' },
  diet_checkin:      { icon: 'nutrition-outline', bg: '#FEF3C7' },
  exercise_checkin:  { icon: 'fitness-outline', bg: '#E0F2FE' },
  weight_checkin:    { icon: 'scale-outline', bg: '#D1FAE5' },
  sleep:             { icon: 'moon-outline', bg: '#EEF2FF' },
  substance:         { icon: 'warning-outline', bg: '#FCE7F3' },
};
const FOLLOWUP_TYPE_LABEL = { phone: '电话随访', wechat: '微信随访', visit: '上门随访', video: '视频随访', other: '其他' };
const CHECKIN_ITEM_LABEL = { diet: '饮食', exercise: '运动', sleep: '睡眠', alcohol: '烟酒', weight: '体重', bloodPressure: '血压', bloodSugar: '血糖', heartRate: '心率', water: '饮水' };

// 常用工具宫格：线性SVG图标（对齐首页视觉方案原型），icon 用 components/iconSvgs.js 里已收录的 lucide 图标名
const GRID_TOOLS = [
  { icon: 'trending-up',  label: '健康趋势', url: '/pages/records/index/index?tab=trend' },
  { icon: 'pill',         label: '用药管理', url: '/pages/medication/index' },
  { icon: 'file-text',    label: '体检报告', url: '/pages/records/medical-reports/index' },
  { icon: 'folder-open',  label: '健康档案', url: '/pages/records/index/index' },
  { icon: 'brain',        label: 'AI健康助手', url: '/pages/chat/index' },
  { icon: 'leaf',         label: '营养素', url: '/pages/nutrition/index' },
  { icon: 'microscope',   label: '专项筛查', url: '/pages/records/screening/index' },
  { icon: 'shopping-bag', label: '服务商城', url: '/pages/services/mall/index' },
];

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
      borderBottom: isLast ? 'none' : `1px solid ${hc.border}`,
    }}>
      <View style={{ width: '44px', height: '44px', borderRadius: '13px', backgroundColor: iconCfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={iconCfg.icon} size={20} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: '14px', fontWeight: 600, color: hc.text1, display: 'block' }} numberOfLines={1}>{task.title}</Text>
        <Text style={{ fontSize: '12px', color: hc.text3, marginTop: '2px' }} numberOfLines={1}>{task.assignee} · {task.dueDate} {task.dueTime}</Text>
      </View>
      <View style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <View style={{ padding: '4px 10px', borderRadius: '999px', backgroundColor: urgency.bg }}>
          <Text style={{ fontSize: '11px', fontWeight: 700, color: urgency.color }}>{urgency.label}</Text>
        </View>
        <Text style={{ fontSize: '14px', color: hc.text3 }}>›</Text>
      </View>
    </View>
  );
}

function ReminderItemRow({ reminder, isLast }) {
  const meta = REM_CAT_META[reminder.category] || REM_CAT_META.medication;
  const time = reminder.reminderTime || '';
  return (
    <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, padding: '14px 0', borderBottom: isLast ? 'none' : `1px solid ${hc.border}` }}>
      <View style={{ width: '44px', height: '44px', borderRadius: '13px', backgroundColor: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={meta.icon} size={20} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: '14px', fontWeight: 600, color: hc.text1, display: 'block' }} numberOfLines={1}>{reminder.title}</Text>
        <Text style={{ fontSize: '12px', color: hc.text3, marginTop: '2px' }} numberOfLines={1}>提醒{time ? ` · ${time}` : ''}</Text>
      </View>
      <View style={{ padding: '4px 10px', borderRadius: '999px', backgroundColor: meta.bg, flexShrink: 0 }}>
        <Text style={{ fontSize: '11px', fontWeight: 700, color: hc.text2 }}>提醒</Text>
      </View>
    </View>
  );
}

function TaskDetailModal({ task, onClose, onDone }) {
  const isFollowup = task.type === 'followup' || task._isFollowup;
  return (
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <View style={{ backgroundColor: '#fff', borderRadius: '24px 24px 0 0', padding: `${spacing.lg}px`, width: '100%', boxSizing: 'border-box', maxHeight: '80vh', overflowY: 'auto' }}>
        <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: hc.border, margin: '0 auto 16px' }} />
        <Text style={{ fontSize: '17px', fontWeight: 700, color: hc.text1, display: 'block', marginBottom: '8px' }}>{task.title || task.theme}</Text>
        {!!(task.assignee || task.staffId?.name) && <Text style={{ fontSize: '13px', color: hc.text3, display: 'block', marginBottom: '4px' }}>负责人：{task.assignee || task.staffId?.name}</Text>}
        {!!(task.dueDate || task.date) && <Text style={{ fontSize: '13px', color: hc.text3, display: 'block', marginBottom: '8px' }}>时间：{task.dueDate || (task.date ? new Date(task.date).toLocaleDateString('zh-CN') : '')}</Text>}

        {isFollowup ? (
          <View>
            {!!task.followupType && (
              <View style={{ display: 'flex', marginBottom: '10px' }}>
                <Text style={{ fontSize: '13px', color: hc.text3, width: '64px' }}>随访方式</Text>
                <Text style={{ fontSize: '13px', color: hc.text1, flex: 1 }}>{FOLLOWUP_TYPE_LABEL[task.followupType] || task.followupType}</Text>
              </View>
            )}
            {task.checkInItems?.length > 0 && (
              <View style={{ display: 'flex', marginBottom: '10px' }}>
                <Text style={{ fontSize: '13px', color: hc.text3, width: '64px' }}>打卡项目</Text>
                <View style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {task.checkInItems.map((k, i) => (
                    <View key={i} style={{ backgroundColor: hc.teal100, padding: '3px 10px', borderRadius: '999px' }}>
                      <Text style={{ fontSize: '12px', color: hc.teal700 }}>{CHECKIN_ITEM_LABEL[k] || k}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {!!task.description && (
              <View style={{ display: 'flex', marginBottom: '4px' }}>
                <Text style={{ fontSize: '13px', color: hc.text3, width: '64px' }}>备注</Text>
                <Text style={{ fontSize: '13px', color: hc.text1, flex: 1 }}>{task.description}</Text>
              </View>
            )}
            {task.formFields?.length > 0 && (
              <View style={{ marginTop: '12px', borderTop: `1px solid ${hc.border}`, paddingTop: '12px' }}>
                {task.formFields.map((field, fi) => {
                  const val = task.formData?.[field.label];
                  const displayVal = Array.isArray(val) ? val.join('、') : (val ?? '—');
                  return (
                    <View key={fi} style={{ display: 'flex', marginBottom: '10px' }}>
                      <Text style={{ fontSize: '13px', color: hc.text3, width: '80px' }}>{field.label}</Text>
                      <Text style={{ fontSize: '13px', color: hc.text1, flex: 1 }}>{displayVal}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          !!task.content && (
            <Text style={{ fontSize: '14px', color: hc.text2, lineHeight: '20px', display: 'block', marginBottom: `${spacing.md}px`, backgroundColor: hc.bg, borderRadius: `${hc.radiusSm}`, padding: `${spacing.md}px` }}>
              {task.content}
            </Text>
          )
        )}

        <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.md}px` }}>
          <View onClick={onClose} style={{ flex: 1, textAlign: 'center', padding: '12px', borderRadius: hc.radiusMd, border: `1.5px solid ${hc.border}` }}>
            <Text style={{ fontSize: '14px', color: hc.text2, fontWeight: 600 }}>关闭</Text>
          </View>
          {!isFollowup && (
            <View onClick={onDone} style={{ flex: 2, textAlign: 'center', padding: '12px', borderRadius: hc.radiusMd, backgroundColor: hc.teal600 }}>
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

  const statusEmoji = score >= 80 ? 'sparkles' : score >= 60 ? 'fitness-outline' : 'leaf-outline';
  const statusText = score >= 80 ? '今天状态不错' : score >= 60 ? '继续保持' : '需要关注';

  const scoreHistory = dashData?.scoreHistory || [];
  const grade = user?.healthScoreDetail?.grade || (score >= 90 ? '优' : score >= 75 ? '良' : score >= 60 ? '中' : '差');
  const gradeColors = { 优: hc.teal600, 良: '#86EFAC', 中: '#FCD34D', 差: '#FCA5A5' };
  const scoreTrendPoints = scoreHistory.map((h) => ({ label: h.date, value: h.score }));

  // 血压/血糖状态判断（仅用于首页趋势文案，具体数值展示在健康档案页）
  const vitals = dashData?.latestVitals || {};
  const bpStatusKey = vitals.bloodPressure?.status || 'normal';
  const bsStatusKey = vitals.bloodSugar?.status || 'normal';
  const bpLabel = bpStatusKey === 'normal' ? '正常' : bpStatusKey === 'low' ? '偏低' : '偏高';
  const bsLabel = bsStatusKey === 'normal' ? '正常' : bsStatusKey === 'low' ? '偏低' : '偏高';
  // 血压/血糖异常 或 评分趋势文案优先展示，其次才是成长打卡的亮点指标（收缩压变好之类）——
  // 2026-07-19改版把打卡卡片内的健康洞察合并到这里，评分卡的建议行只保留一条最值得关注的文案
  const trendActionText = (() => {
    if (bpStatusKey !== 'normal') return `血压${bpLabel}，建议今天测量并联系医师`;
    if (bsStatusKey !== 'normal') return `血糖${bsLabel}，建议今天复测并联系医师`;
    if (growth.trendHighlight) {
      const h = growth.trendHighlight;
      return `你的${h.label}在变好：${h.from}${h.unit} → ${h.to}${h.unit}，继续保持`;
    }
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

  // 今日打卡进度：todayStatus接口未在首页拉取（沿用原有精简首屏请求集），
  // 用 growth.streak>0 时展示"继续坚持"文案，实际每日打卡完成度以打卡页 pages/checkin/index 为准
  const checkinDone = dashData?.todayCheckinCount ?? null;
  const checkinTotal = dashData?.todayCheckinTotal ?? null;
  const checkinCtaTitle = (checkinDone != null && checkinTotal != null)
    ? `今日已打卡 ${checkinDone}/${checkinTotal} 项`
    : '完成今日打卡';
  const checkinCtaSub = (checkinDone != null && checkinTotal != null && checkinDone < checkinTotal)
    ? '继续完成剩余打卡'
    : '记录今天的健康数据';

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
    <ScrollView scrollY style={{ minHeight: '100vh', backgroundColor: hc.bg }}>
      {/* logo栏：真实品牌logo图（图标+"嘉医汇"，隐藏拼音/®以适配窄空间）+ 单行slogan。
          浅色底与页面背景同色，右侧预留胶囊按钮(···/－/◎)安全区不放内容，避免遮挡微信原生控件 */}
      <View style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
        padding: `${statusBarHeight + 6}px ${hc.capsuleSafeWidth} 14px 16px`, backgroundColor: hc.bg,
      }}>
        <View style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
          <View style={{ width: '68px', height: '18px', overflow: 'hidden' }}>
            <Image src={logoFullTransparent} mode="aspectFit" style={{ width: '86px', height: '27px', marginLeft: '-1px' }} />
          </View>
          <Text style={{ fontSize: '10.5px', color: hc.text3, whiteSpace: 'nowrap', paddingLeft: '2px' }} numberOfLines={1}>
            私人家庭医生 · 全家人的健康顾问
          </Text>
        </View>
      </View>

      <View style={{ padding: `0 ${spacing.lg}px` }}>
        {/* 评分卡：浅青绿背景卡片（2026-07-19从深色墨绿通栏改版），头像入口放在"早上好"这一行右侧，
            与顶部胶囊按钮不同排，避免遮挡冲突 */}
        <View style={{
          background: `linear-gradient(155deg, ${hc.teal100} 0%, #DDF3EE 100%)`,
          border: '1px solid rgba(20,148,133,0.14)', borderRadius: hc.radiusLg,
          padding: '22px 20px', marginBottom: `${spacing.md}px`, boxShadow: '0px 8px 20px rgba(14,61,56,0.07)',
        }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: '13px', color: hc.teal700, opacity: 0.8 }}>{greeting}</Text>
            <View
              style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: hc.teal600, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 6px rgba(20,148,133,0.3)' }}
              onClick={() => Taro.switchTab({ url: '/pages/profile/index/index' })}
            >
              <Text style={{ fontSize: '12px', color: '#fff', fontWeight: 700 }}>{name[0]}</Text>
            </View>
          </View>
          <Text style={{ fontSize: '19px', fontWeight: 800, color: hc.text1, display: 'block', margin: '4px 0 18px' }}>
            {name}，{statusText} <Icon name={statusEmoji} size={18} color={hc.text1} />
          </Text>
          <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
            <Text style={{ fontSize: '52px', fontWeight: 800, color: hc.teal700, lineHeight: '56px', letterSpacing: '-1px' }}>
              {scoreDisplay != null ? scoreDisplay : '--'}
            </Text>
            <View style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <Text style={{ fontSize: '12px', color: hc.text2, fontWeight: 500 }}>
                {scoreDisplay != null ? '健康评分 / 100' : '暂无评分，请录入数据'}
              </Text>
              {scoreDisplay != null && (
                <Text style={{ fontSize: '12px', fontWeight: 700, color: '#fff', backgroundColor: gradeColors[grade] || hc.teal600, padding: '2px 9px', borderRadius: '999px', display: 'inline-block', width: 'fit-content' }}>{grade}</Text>
              )}
              {isDemo && (
                <Text style={{
                  fontSize: '12px', color: hc.teal700, fontWeight: 600, backgroundColor: 'rgba(255,255,255,0.6)',
                  padding: '3px 8px', borderRadius: '999px', display: 'inline-block',
                }}>↑ 较上月 +3 分</Text>
              )}
            </View>
            {scoreDisplay != null && scoreTrendPoints.length >= 2 && (
              <View style={{ marginLeft: 'auto', width: '80px' }}>
                <TrendChart points={scoreTrendPoints} height={24} color={hc.teal500} mini showValues={false} />
              </View>
            )}
          </View>
          {trendActionText && (
            <View style={{ marginTop: '16px', backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: '10px', padding: '10px 12px' }}>
              <Text style={{ fontSize: '12px', color: hc.teal700, fontWeight: 600, lineHeight: '17px' }}>{trendActionText}</Text>
            </View>
          )}
        </View>

        {/* 成长打卡卡片：连续天数+迷你趋势（原右上角累计数字改为趋势线）+ 月历默认收起(点击展开)+
            打卡按钮带今日进度文案。健康洞察已合并到评分卡建议行，此卡片只聚焦"坚持了几天"。
            从未打卡（streak=0且totalCheckinDays=0）时不渲染，新用户先引导打卡，不空谈成长——与app端一致 */}
        {(growth.streak > 0 || growth.totalCheckinDays > 0) && (
          <View style={{ backgroundColor: hc.surface, borderRadius: hc.radiusLg, padding: '18px', marginBottom: '16px', boxShadow: hc.shadowCard }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ display: 'flex', alignItems: 'baseline' }}>
                <Icon name="flame-outline" size={20} color={hc.amber} style={{ marginRight: '6px' }} />
                <Text style={{ fontSize: '32px', fontWeight: 800, color: hc.teal700, lineHeight: '36px' }}>{growth.streak}</Text>
                <Text style={{ fontSize: '14px', color: hc.text2, fontWeight: 600, marginLeft: '4px' }}>天连续打卡</Text>
              </View>
              {scoreTrendPoints.length >= 2 ? (
                <View style={{ width: '70px' }}>
                  <TrendChart points={scoreTrendPoints.slice(-7)} height={20} color={hc.teal400} mini showValues={false} />
                </View>
              ) : (
                <Text style={{ fontSize: '12px', color: hc.text3 }}>近30天 {growth.totalCheckinDays} 天</Text>
              )}
            </View>

            {/* 月历默认收起：小程序无原生<details>标签，用点击态展开/收起代替（复用点击态存本组件外的父状态较复杂，
                首页数据量不大，这里退化为始终显示"近30天累计"一行 + 跳转打卡页查看完整月历，比强行模拟折叠交互更简单可靠 */}
            <View
              onClick={() => Taro.navigateTo({ url: '/pages/checkin/index' })}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', padding: '2px 0' }}
            >
              <Text style={{ fontSize: '12.5px', color: hc.text2, fontWeight: 600 }}>
                近30天累计 <Text style={{ color: hc.teal700, fontSize: '14px', fontWeight: 800 }}>{growth.totalCheckinDays}</Text> 天
              </Text>
              <View style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Text style={{ fontSize: '12px', color: hc.teal600, fontWeight: 600 }}>查看月历</Text>
                <Text style={{ fontSize: '12px', color: hc.teal600 }}>›</Text>
              </View>
            </View>

            {growth.streak > 0 && (
              <Text style={{ marginTop: '12px', textAlign: 'center', fontSize: '13px', color: hc.text2, display: 'block' }}>
                今天是坚持第 {growth.streak + 1} 天，点击下方按钮完成今日打卡 <Icon name="arrow-down-outline" size={13} color={hc.text2} />
              </Text>
            )}

            {/* 打卡入口按钮：带今日打卡进度文案，转化力比命令式"完成今日打卡"更强 */}
            <View onClick={() => Taro.navigateTo({ url: '/pages/checkin/index' })} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: `linear-gradient(120deg, ${hc.teal600}, ${hc.teal500})`,
              borderRadius: hc.radiusMd, padding: '14px 18px', marginTop: '14px',
              boxShadow: '0px 6px 16px rgba(20,148,133,0.28)',
            }}>
              <View style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="checkmark-circle" size={16} color="#fff" />
              </View>
              <View style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <Text style={{ color: '#fff', fontSize: '14.5px', fontWeight: 700 }}>{checkinCtaTitle}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: '11px', fontWeight: 500 }}>{checkinCtaSub}</Text>
              </View>
              <Text style={{ fontSize: '16px', color: 'rgba(255,255,255,0.85)' }}>›</Text>
            </View>
          </View>
        )}

        {/* 若从未打卡（无成长卡片时），仍需保留打卡入口 */}
        {!(growth.streak > 0 || growth.totalCheckinDays > 0) && (
          <View onClick={() => Taro.navigateTo({ url: '/pages/checkin/index' })} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: `linear-gradient(120deg, ${hc.teal600}, ${hc.teal500})`,
            borderRadius: hc.radiusMd, padding: '14px 18px', marginBottom: `${spacing.lg}px`,
            boxShadow: '0px 6px 16px rgba(20,148,133,0.28)',
          }}>
            <View style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="checkmark-circle" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <Text style={{ color: '#fff', fontSize: '14.5px', fontWeight: 700 }}>完成今日打卡</Text>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: '11px', fontWeight: 500 }}>记录今天的健康数据</Text>
            </View>
            <Text style={{ fontSize: '16px', color: 'rgba(255,255,255,0.85)' }}>›</Text>
          </View>
        )}

        {/* 待办任务：像素级对齐app端TaskItem/ReminderItem图标行+紧急度徽章，
            "随访"已移出Tab，"全部"入口跳转独立随访页（2026-07-18 Tab结构调整）。
            2026-07-19改版：提到常用工具宫格前面 */}
        <View style={{ marginTop: growth.streak > 0 || growth.totalCheckinDays > 0 ? 0 : undefined, marginBottom: `${spacing.lg}px` }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '11px', fontWeight: 700, color: hc.text3, letterSpacing: '1.2px', textTransform: 'uppercase' }}>待办任务</Text>
            <View onClick={() => Taro.navigateTo({ url: '/pages/tasks/index' })} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <Text style={{ fontSize: '13px', color: hc.teal600, fontWeight: 500 }}>全部</Text>
              <Text style={{ fontSize: '13px', color: hc.teal600 }}>›</Text>
            </View>
          </View>
          <View style={{ backgroundColor: hc.surface, borderRadius: hc.radiusLg, boxShadow: hc.shadowCard, overflow: 'hidden', padding: `0 ${spacing.md}px` }}>
            {loading ? (
              <Text style={{ fontSize: '13px', color: hc.text3, display: 'block', padding: '20px 0', textAlign: 'center' }}>加载中...</Text>
            ) : (allPendingTaskItems.length === 0 && todayReminders.length === 0) ? (
              <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: `${spacing.xl}px 0`, gap: `${spacing.sm}px` }}>
                <Icon name="checkmark-circle" size={32} color={hc.teal600} />
                <Text style={{ fontSize: '14px', color: hc.text3 }}>暂无待办任务</Text>
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
              <Text style={{ fontSize: '12px', color: hc.teal600 }}>⋯</Text>
              <Text style={{ fontSize: '11px', color: hc.teal600, fontWeight: 500, flex: 1 }}>还有 {allPendingTaskItems.length - 3} 项待办 · 查看全部</Text>
              <Text style={{ fontSize: '12px', color: hc.teal600 }}>›</Text>
            </View>
          )}
          {todayReminders.length > 0 && (
            <View onClick={() => Taro.navigateTo({ url: '/pages/reminders/index' })} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', padding: '0 4px' }}>
              <Icon name="notifications-outline" size={12} color={hc.teal600} />
              <Text style={{ fontSize: '11px', color: hc.teal600, fontWeight: 500, flex: 1 }}>今日 {todayReminders.length} 条提醒已合并 · 管理提醒</Text>
              <Text style={{ fontSize: '12px', color: hc.teal600 }}>›</Text>
            </View>
          )}
        </View>

        {/* 常用工具宫格：对齐首页视觉方案原型，2026-07-19新增，跳转到各自已存在的功能页 */}
        <View style={{ marginBottom: `${spacing.lg}px` }}>
          <Text style={{ fontSize: '11px', fontWeight: 700, color: hc.text3, letterSpacing: '1.2px', textTransform: 'uppercase', display: 'block', marginBottom: `${spacing.sm}px` }}>常用工具</Text>
          <View style={{ backgroundColor: hc.surface, borderRadius: hc.radiusLg, boxShadow: hc.shadowCard, padding: '18px 14px', display: 'flex', flexWrap: 'wrap' }}>
            {GRID_TOOLS.map((tool) => (
              <View
                key={tool.icon}
                onClick={() => Taro.navigateTo({ url: tool.url })}
                style={{ width: '25%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px', marginBottom: '16px' }}
              >
                <View style={{ width: '42px', height: '42px', borderRadius: '13px', backgroundColor: hc.teal050, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={tool.icon} size={21} color={hc.teal700} />
                </View>
                <Text style={{ fontSize: '11px', color: hc.text2, fontWeight: 600 }}>{tool.label}</Text>
              </View>
            ))}
          </View>
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
