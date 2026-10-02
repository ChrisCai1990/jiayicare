import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { userAPI, tasksAPI, followupTasksAPI, systemAPI, servicesAPI, metabolicPilotAPI } from '../../services/api';
import TrendChart from '../../components/TrendChart';
import Icon from '../../components/Icon';
import useNavBar from '../../hooks/useNavBar';
import { openManagerConversation } from '../../utils/managerConversation';
import { homeTaskCards } from '../../utils/homeTaskCards';

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

function TaskItemRow({ task, onPress }) {
  const urgency = task.scheduleLabel ? {...URGENCY_CONFIG.low,label:task.scheduleLabel} : URGENCY_CONFIG[task.priority] || URGENCY_CONFIG.low;
  const upload = task.uploadTask || (task.canUploadReports ? task : null);
  const title = task.uploadTask ? String(task.title || '').replace(/^本次就医安排\s*·\s*/, '') : task.title || '健康安排';
  return <View style={{backgroundColor:'#fff',borderRadius:'18px',padding:'16px',marginBottom:'10px'}}>
    <View onClick={() => onPress(task)} style={{display:'flex',alignItems:'center',gap:'10px'}}>
      <View style={{width:'36px',height:'36px',borderRadius:'11px',backgroundColor:colors.primary10,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Icon name="📋" size={19} color={colors.primary}/></View>
      <View style={{flex:1,minWidth:0}}><Text style={{display:'block',fontSize:'15px',fontWeight:600,color:colors.textPrimary}}>{title}</Text><Text style={{display:'block',fontSize:'12px',color:colors.textSecondary,marginTop:'3px'}}>{task.assignee} · {displayTaskDate(task.dueDate || task.date)} {task.dueTime}</Text></View>
      <Text style={{fontSize:'12px',color:colors.primary,flexShrink:0}}>{upload ? '详情 ›' : urgency.label+' ›'}</Text>
    </View>
    {upload && <>
      <Text style={{display:'block',margin:'10px 0 12px 46px',fontSize:'12px',color:colors.textSecondary}}>{task.assignee} · {urgency.label}</Text>
      <View style={{display:'flex',alignItems:'center',gap:'10px',backgroundColor:colors.primary10,borderRadius:'12px',padding:'12px'}}>
        <View style={{flex:1,minWidth:0}}><Text style={{display:'block',fontSize:'11px',color:colors.primary}}>{upload.documentDeclaration?'已反馈，待专员核实':'需要你处理'}</Text><Text style={{display:'block',fontSize:'13px',color:colors.textPrimary,marginTop:'4px'}}>{upload.documentDeclaration?upload.documentDeclaration.label:'就医后提交资料或说明情况'}</Text></View>
        <View onClick={() => Taro.navigateTo({url:'/pages/tasks/report-upload/index?flowId='+encodeURIComponent(upload.careFlowId)})} style={{padding:'10px',backgroundColor:colors.primary,borderRadius:'9px',flexShrink:0}}><Text style={{fontSize:'13px',color:'#fff'}}>{upload.documentDeclaration?'查看反馈':'提交资料'}</Text></View>
      </View>
    </>}
  </View>;
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

function ButtonUpload({task}){return <View onClick={()=>Taro.navigateTo({url:'/pages/tasks/report-upload/index?flowId='+task.careFlowId})} style={{padding:'12px',backgroundColor:'#E8F5EF',borderRadius:'12px'}}><Text>上传本次报告及病历</Text></View>}
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
          {task.canUploadReports && <ButtonUpload task={task}/>}{!isFollowup && !task.customerReadOnly && (
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
  const { user: authUser, token, loading: authLoading, isDemo } = useAuth();
  const { statusBarHeight } = useNavBar();
  const runtimeInfo = (() => {
    try {
      const info = Taro.getAccountInfoSync?.();
      return `${info?.miniProgram?.envVersion || 'unknown'} ${info?.miniProgram?.version || 'no-version'}`;
    } catch (_) {
      return 'unknown no-version';
    }
  })();
  const [dashData, setDashData] = useState(null);
  const [pilotData, setPilotData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sectionState, setSectionState] = useState({ dashboard: 'loading', tasks: 'loading', followups: 'loading', services: 'loading' });
  const sessionRef = useRef(token);
  sessionRef.current = token;
  const [taskDetail, setTaskDetail] = useState(null);
  const [popularServices, setPopularServices] = useState([]);
  const loadRequestRef = useRef(0);

  // Each source publishes independently; a slow mall request must not hold up tasks.
  const loadCore = useCallback(async () => {
    if (authLoading) return;
    const requestId = ++loadRequestRef.current;
    const current = () => requestId === loadRequestRef.current && sessionRef.current === token;
    setLoading(true);
    setSectionState({ dashboard: token ? 'loading' : 'ready', tasks: token ? 'loading' : 'ready', followups: token ? 'loading' : 'ready', services: 'loading' });
    if (!token) { setDashData(null); setTasks([]); setFollowups([]); setPilotData(null); }
    const load = async (key, request, apply) => {
      try {
        const result = await request();
        if (!result?.success) throw new Error('加载失败');
        if (!current()) return;
        apply(result.data);
        setSectionState(previous => ({ ...previous, [key]: 'ready' }));
      } catch {
        if (current()) setSectionState(previous => ({ ...previous, [key]: 'error' }));
      }
    };
    const jobs = [load('services', () => servicesAPI.list(), data => setPopularServices((data?.services || []).slice(0, 4)))];
    if (token) jobs.push(
      load('dashboard', () => userAPI.getDashboard(), setDashData),
      load('tasks', () => tasksAPI.list(), data => setTasks((data || []).filter(t => t.status === 'pending'))),
      load('followups', () => followupTasksAPI.list(), data => setFollowups((data || []).filter(p => !p.completedByUser && !['completed', 'cancelled'].includes(p.status)))),
      metabolicPilotAPI.get().then(result => { if (current()) setPilotData(result?.data || null); }).catch(() => { if (current()) setPilotData(null); })
    );
    await Promise.all(jobs);
    if (current()) setLoading(false);
  }, [token, authLoading]);

  useEffect(() => { setDashData(null); setTasks([]); setFollowups([]); setPilotData(null); setTaskDetail(null); }, [token]);
  useEffect(() => () => { loadRequestRef.current += 1; }, []);

  useEffect(() => { loadCore(); }, [loadCore]);

  useDidShow(() => { loadCore(); });
  usePullDownRefresh(() => { loadCore().then(() => { Taro.stopPullDownRefresh(); }); });

  // systemAPI.push() 同理挪到首屏之后延迟触发，fire-and-forget，不参与启动阶段的并发请求
  useEffect(() => {
    if (!token) return undefined;
    const timer = setTimeout(() => { systemAPI.push().catch(() => {}); }, 1500);
    return () => clearTimeout(timer);
  }, [token]);

  const user = { ...(authUser || {}), ...(dashData?.user || {}) };
  const manager = (Array.isArray(authUser?.careTeam) ? authUser.careTeam : []).find(m => m.kind === 'healthManager');
  const sectionError = keys => keys.some(key => sectionState[key] === 'error');
  const tasksLoading = ['tasks', 'followups', 'dashboard'].some(key => sectionState[key] === 'loading');
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

  const submittedFeedback=homeTaskCards(allPendingTaskItems.filter(t=>t.documentDeclaration||t.customerActionRequired===false));
  const taskCards = homeTaskCards(allPendingTaskItems.filter(t=>!t.documentDeclaration&&t.customerActionRequired!==false));
  const showScoreTrend = () => Taro.showModal({title:'健康评分趋势',content:(scoreHistory.length ? scoreHistory.map(h => `${h.date}：${h.score} 分`).join('\n') : '暂无历史评分记录') + '\n\n评分仅供健康管理参考，不作为医学诊断。',showCancel:false});

  const markTaskDone = async () => {
    if (!taskDetail || taskDetail.customerReadOnly) return;
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
      <View style={{padding:`${statusBarHeight+8}px ${spacing.lg}px 18px`,paddingRight:'112px',backgroundColor:colors.background}}>
        <Text style={{fontSize:'18px',fontWeight:700,color:colors.primary,display:'block'}}>嘉医汇 · 嘉医管家</Text>
        <Text style={{fontSize:'11px',color:colors.textMuted,display:'block',marginTop:'4px'}}>健康有人管，生活更安心</Text>
      </View>
      <View style={{ padding: `0 ${spacing.lg}px` }}>
        <View style={{backgroundColor:'#fff',borderRadius:'18px',padding:'18px',marginBottom:'22px'}}>
          <View style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px'}}>
            <View style={{flex:1,minWidth:0}}><Text style={{fontSize:'12px',color:colors.textMuted,display:'block'}}>{name}，{greeting}</Text><Text style={{fontSize:'19px',fontWeight:600,color:colors.textPrimary,display:'block',marginTop:'6px'}}>照顾好今天的你</Text></View>
            <View onClick={showScoreTrend} style={{padding:'8px 10px',borderRadius:'12px',backgroundColor:colors.primary10,textAlign:'center',flexShrink:0}}>
              <Text style={{fontSize:'26px',fontWeight:700,color:colors.primary,display:'block'}}>{scoreDisplay ?? '--'}</Text><Text style={{fontSize:'10px',color:colors.textMuted}}>健康评分 ›</Text>
            </View>
          </View>
          <View onClick={sectionState.dashboard === 'error' ? loadCore : showScoreTrend} style={{display:'flex',alignItems:'center',gap:'7px',margin:'14px 0'}}><Icon name="📈" size={16} color={colors.textSecondary}/><Text style={{flex:1,fontSize:'12px',color:colors.textSecondary}}>{sectionState.dashboard === 'error' ? '健康概览暂未更新' : (trendActionText || '记录近期变化，了解健康趋势').split('，')[0]}</Text><Text style={{fontSize:'12px',color:colors.primary}}>{sectionState.dashboard === 'error' ? '重试 ›' : '查看趋势 ›'}</Text></View>
          <View onClick={()=>Taro.navigateTo({url:'/pages/checkin/index'})} style={{display:'flex',alignItems:'center',gap:'9px',backgroundColor:colors.primary,borderRadius:'12px',padding:'13px 15px'}}>
            <Text style={{fontSize:'22px',color:'#fff'}}>＋</Text><Text style={{flex:1,fontSize:'15px',fontWeight:600,color:'#fff'}}>记录健康数据</Text><Text style={{color:'#fff'}}>›</Text>
          </View>
          {(pilotData?.help?.status==='open'||(pilotData?.help?.status==='closed'&&!pilotData.help.readAt))&&<View onClick={()=>Taro.navigateTo({url:'/pages/checkin/index'})} style={{backgroundColor:colors.primary10,borderRadius:'12px',padding:'12px',marginTop:'12px'}}>
            <Text style={{display:'block',fontSize:'13px',fontWeight:600,color:colors.primary}}>{pilotData.help.status==='open'?'体重管理求助待处理':'体重管理求助已回复'} ›</Text>
            <Text style={{display:'block',fontSize:'12px',color:colors.textPrimary,marginTop:'5px'}} numberOfLines={2}>{pilotData.help.status==='open'?`负责人：${pilotData.helpOwner||'待核对'}`:pilotData.help.reply||'点击查看处理结果'}</Text>
          </View>}
          <Text style={{fontSize:'11px',color:colors.textMuted,display:'block',textAlign:'center',marginTop:'10px'}}>{growth.totalCheckinDays>0?`近30天已记录 ${growth.totalCheckinDays} 天`:'每一次记录，都多一份了解'}</Text>
        </View>

        {/* 待办任务：像素级对齐app端TaskItem/ReminderItem图标行+紧急度徽章，
            "随访"已移出Tab，"全部"入口跳转独立随访页（2026-07-18 Tab结构调整） */}
        <View style={{ marginBottom: `${spacing.lg}px` }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary }}>近期安排</Text>
            <View onClick={() => Taro.navigateTo({ url: '/pages/tasks/index' })} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <Text style={{ fontSize: '13px', color: colors.primary, fontWeight: 500 }}>查看全部</Text>
              <Text style={{ fontSize: '13px', color: colors.primary }}>›</Text>
            </View>
          </View>
          <View>
            {sectionError(['dashboard','tasks','followups']) && <Text onClick={loadCore} style={{display:'block',padding:'12px 0',fontSize:'13px',color:colors.danger}}>部分健康安排暂未加载，点击重试{allPendingTaskItems.length ? '；下方保留已加载内容' : ''}</Text>}
            {!token ? <Text onClick={() => Taro.navigateTo({url:'/pages/auth/login/index'})} style={{display:'block',padding:'20px 0',fontSize:'13px',color:colors.primary}}>登录后查看你的健康安排 ›</Text> : tasksLoading && allPendingTaskItems.length === 0 && todayReminders.length === 0 ? (
              <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', padding: '20px 0', textAlign: 'center' }}>加载中...</Text>
            ) : (allPendingTaskItems.length === 0 && todayReminders.length === 0) ? (sectionError(['dashboard','tasks','followups']) ? null : (
              <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: `${spacing.xl}px 0`, gap: `${spacing.sm}px` }}>
                <Icon name="✅" size={32} color={colors.primary} />
                <Text style={{ fontSize: '14px', color: colors.textMuted }}>暂无健康计划</Text>
              </View>
            )) : (
              <>
                {taskCards.slice(0, 3).map((t, i, arr) => (
                  <TaskItemRow key={t._id || i} task={t} isLast={i === arr.length - 1 && todayReminders.length === 0} onPress={t=>setTaskDetail(t)} />
                ))}
                {todayReminders.map((r, i) => (
                  <ReminderItemRow key={r._id || i} reminder={r} isLast={i === todayReminders.length - 1} />
                ))}
              </>
            )}
          </View>
          {taskCards.length > 3 && (
            <View onClick={() => Taro.navigateTo({ url: '/pages/tasks/index' })} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', padding: '0 4px' }}>
              <Text style={{ fontSize: '12px', color: colors.primary }}>⋯</Text>
              <Text style={{ fontSize: '11px', color: colors.primary, fontWeight: 500, flex: 1 }}>还有 {taskCards.length - 3} 项健康计划 · 查看全部</Text>
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

        {submittedFeedback.length>0&&<View onClick={()=>Taro.navigateTo({url:'/pages/tasks/index?feedback=1'})} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'14px 16px',marginBottom:'20px',display:'flex',justifyContent:'space-between'}}><Text style={{fontSize:'13px',color:colors.textSecondary}}>已提交反馈 · {submittedFeedback.length} 项待团队处理</Text><Text style={{fontSize:'13px',color:colors.primary}}>查看 ›</Text></View>}
        <View style={{marginBottom:'24px'}}>
          <Text style={{fontSize:'17px',fontWeight:700,color:colors.textPrimary,display:'block',marginBottom:'12px'}}>我的权益</Text>
          <View onClick={()=>Taro.navigateTo({url:'/pages/profile/benefits/index?section=plan'})} style={{backgroundColor:'#fff',borderRadius:'18px',padding:'18px',display:'flex',alignItems:'center',gap:'12px'}}>
            <Icon name="🎁" size={24} color={colors.primary}/>
            <View style={{flex:1,minWidth:0}}><Text style={{fontSize:'15px',fontWeight:600,display:'block',color:colors.textPrimary}}>会员权益</Text><Text style={{fontSize:'12px',color:colors.textSecondary,display:'block',marginTop:'5px'}}>查看计划、使用情况与健康基金</Text>{user?.healthFund?.total!=null&&<Text style={{fontSize:'13px',color:colors.primary,display:'block',marginTop:'7px'}}>健康基金余额 ¥{Number(user.healthFund.total).toFixed(2)}</Text>}</View>
            <Text style={{color:colors.primary}}>›</Text>
          </View>
        </View>
        <View style={{ marginBottom: `${spacing.lg}px` }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary }}>更多健康服务</Text>
            <View onClick={() => Taro.navigateTo({ url: '/pages/services/mall/index' })}><Text style={{ fontSize: '12px', color: colors.primary }}>全部商城 ›</Text></View>
          </View>
          {sectionState.services === 'error' && <Text onClick={loadCore} style={{display:'block',padding:'12px 0',fontSize:'13px',color:colors.danger}}>服务暂未更新，点击重试</Text>}
          {sectionState.services === 'loading' && !popularServices.length && <Text style={{fontSize:'13px',color:colors.textSecondary}}>服务加载中…</Text>}
          {sectionState.services === 'ready' && !popularServices.length && <Text style={{fontSize:'13px',color:colors.textSecondary}}>暂无上架服务</Text>}
          <View style={{backgroundColor:'#fff',borderRadius:'16px',padding:'0 14px'}}>
            {popularServices.map((item, index) => (
              <View key={item.id} onClick={() => Taro.navigateTo({url:'/pages/services/mall/index?productId='+encodeURIComponent(item.id)})} style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 0',borderBottom:index < popularServices.length-1 ? '1px solid '+colors.borderLight : 'none'}}>
                <Icon name="🩺" size={22} color={colors.primary}/>
                <View style={{flex:1,minWidth:0}}><Text style={{fontSize:'14px',fontWeight:600,color:colors.textPrimary,display:'block'}}>{item.name}</Text><Text style={{fontSize:'13px',color:'#A85D17',display:'block',marginTop:'4px'}}>{authUser ? (item.price == null ? '价格请咨询' : '¥'+item.price) : '登录后查看价格'}</Text></View><Text style={{color:colors.primary}}>›</Text>
              </View>
            ))}
          </View>
        </View>

      </View>
      <View style={{padding:'0 20px'}}><View onClick={() => openManagerConversation(authUser?._id)} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 14px', backgroundColor:'#fff', borderRadius:'14px', marginBottom:'18px' }}>
          <Icon name="💬" size={20} color={colors.primary} />
          <View style={{flex:1}}><Text style={{display:'block',fontSize:'14px',fontWeight:600,color:colors.textPrimary}}>联系健管专员{manager?.name ? ' · ' + manager.name : ''}</Text><Text style={{display:'block',fontSize:'12px',color:colors.textSecondary,marginTop:'3px'}}>{!token ? '登录后查看专属服务团队' : manager ? '就医安排、资料上传和日常服务咨询' : '暂未分配健管专员'}</Text></View><Text style={{color:colors.primary}}>›</Text>
        </View></View>
      {/* 底部占位，对齐app端 <View style={{height: spacing.xl*2}}/> */}
      <View style={{ height: '24px' }} />

      {taskDetail && (
        <TaskDetailModal task={taskDetail} onClose={() => setTaskDetail(null)} onDone={markTaskDone} />
      )}
    </ScrollView>
  );
}
