import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { userAPI, recordsAPI, tasksAPI, followupTasksAPI, systemAPI } from '../../services/api';
import TrendChart from '../../components/TrendChart';

// 对齐 app/src/screens/home/HomeScreen.js（2026-07-18 首页瘦身+打卡页重构后）：
// 打卡网格已抽离到独立页 pages/checkin/index，首页只保留入口按钮；健康管家团队卡片已移至"我的"页。
// 血压/血糖迷你走势图、BMI色带、成长打卡卡片（连续天数+月历）、任务详情弹窗均保留，接真实数据。
// 简化点：月历用简单圆点网格而非app端的日历UI组件；任务详情弹窗字段展示做了精简。

function TaskDetailModal({ task, onClose, onDone }) {
  return (
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <View style={{ backgroundColor: '#fff', borderRadius: '24px 24px 0 0', padding: `${spacing.lg}px`, width: '100%', boxSizing: 'border-box' }}>
        <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '0 auto 16px' }} />
        <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>{task.title || task.theme}</Text>
        {!!(task.assignee || task.staffId?.name) && <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', marginBottom: '4px' }}>负责人：{task.assignee || task.staffId?.name}</Text>}
        {!!(task.dueDate || task.date) && <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', marginBottom: '8px' }}>时间：{task.dueDate || (task.date ? new Date(task.date).toLocaleDateString('zh-CN') : '')}</Text>}
        {!!task.content && <Text style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: '20px', display: 'block', marginBottom: `${spacing.md}px` }}>{task.content}</Text>}
        <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.md}px` }}>
          <View onClick={onClose} style={{ flex: 1, textAlign: 'center', padding: '12px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }}>
            <Text style={{ fontSize: '14px', color: colors.textSecondary, fontWeight: 600 }}>关闭</Text>
          </View>
          <View onClick={onDone} style={{ flex: 2, textAlign: 'center', padding: '12px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary }}>
            <Text style={{ fontSize: '14px', color: '#fff', fontWeight: 700 }}>标记完成</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function bmiColor(bmi) {
  if (!bmi) return colors.textMuted;
  if (bmi < 18.5) return colors.info;
  if (bmi < 24) return colors.success;
  if (bmi < 28) return colors.warning;
  return colors.danger;
}
function bmiLabel(bmi) {
  if (!bmi) return '暂无数据';
  if (bmi < 18.5) return '偏瘦';
  if (bmi < 24) return '正常';
  if (bmi < 28) return '偏胖';
  return '肥胖';
}

export default function HomePage() {
  const { user: authUser } = useAuth();
  const [dashData, setDashData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bpTrend, setBpTrend] = useState([]);
  const [bsTrend, setBsTrend] = useState([]);
  const [taskDetail, setTaskDetail] = useState(null);

  // 首屏关键数据：仪表盘/待办/随访，3个并发请求，尽快渲染出首页骨架
  // 今日打卡状态已随打卡网格一起抽离到独立页 pages/checkin/index（2026-07-18 打卡页重构对齐）
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

  // 迷你趋势图数据：非首屏必需，首屏渲染完成后延迟加载，避免拖慢/阻塞小程序启动
  // （曾因和上面4个请求一起在useDidShow里并发发起，真机上偶发"Error: timeout"启动超时）
  const loadTrends = useCallback(async () => {
    try {
      const [bpRes, bsRes] = await Promise.allSettled([
        recordsAPI.trend('bloodPressure'),
        recordsAPI.trend('bloodSugar'),
      ]);
      if (bpRes.status === 'fulfilled' && bpRes.value?.data) {
        setBpTrend(bpRes.value.data.slice(-7).map((r) => ({ label: new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }), value: r.extra?.sys || parseFloat(r.value) || 0 })));
      }
      if (bsRes.status === 'fulfilled' && bsRes.value?.data) {
        setBsTrend(bsRes.value.data.slice(-7).map((r) => ({ label: new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }), value: parseFloat(r.value) || 0 })));
      }
    } catch {}
  }, []);

  useDidShow(() => {
    loadCore().then(() => { loadTrends(); });
  });
  usePullDownRefresh(() => { loadCore().then(() => { loadTrends(); Taro.stopPullDownRefresh(); }); });

  // systemAPI.push() 同理挪到首屏之后延迟触发，fire-and-forget，不参与启动阶段的并发请求
  useEffect(() => {
    const timer = setTimeout(() => { systemAPI.push().catch(() => {}); }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const user = { ...(dashData?.user || {}), ...(authUser || {}) };
  const hasData = dashData?.has_any_health_data ?? false;
  const score = user?.healthScore || 0;
  const name = user?.name || '用户';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const bmi = dashData?.bmi;
  const growth = dashData?.growth || { streak: 0, totalCheckinDays: 0, monthCalendar: [], trendHighlight: null };

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
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${spacing.md}px ${spacing.lg}px` }}>
        <View>
          <Text style={{ fontSize: '20px', fontWeight: 800, color: colors.textPrimary, display: 'block' }}>嘉医汇</Text>
          <Text style={{ fontSize: '11px', color: colors.textMuted }}>私人家庭医生，全生命周期健康管理</Text>
        </View>
        <View
          style={{ width: '36px', height: '36px', borderRadius: '18px', backgroundColor: colors.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => Taro.switchTab({ url: '/pages/profile/index/index' })}
        >
          <Text style={{ fontSize: '16px', color: colors.primary, fontWeight: 700 }}>{name[0]}</Text>
        </View>
      </View>

      <View style={{ padding: `0 ${spacing.lg}px` }}>
        {/* 问候卡 */}
        <View style={{ backgroundColor: '#1E6B50', borderRadius: `${radius.lg}px`, padding: `${spacing.lg}px`, marginBottom: `${spacing.md}px` }}>
          <Text style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>{greeting}</Text>
          <Text style={{ fontSize: '20px', fontWeight: 700, color: '#fff', display: 'block', marginTop: '4px' }}>{name}，继续保持 💪</Text>
          <View style={{ display: 'flex', alignItems: 'baseline', marginTop: `${spacing.md}px` }}>
            <Text style={{ fontSize: '40px', fontWeight: 800, color: '#fff' }}>{hasData ? score : '--'}</Text>
            <Text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginLeft: '8px' }}>{hasData ? '健康评分 / 100' : '暂无评分，请录入数据'}</Text>
          </View>
        </View>

        {/* 成长打卡卡片：连续天数 + 本月日历 + 趋势反馈 */}
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>🔥 连续打卡 {growth.streak} 天</Text>
            <Text style={{ fontSize: '12px', color: colors.textMuted }}>近30天打卡 {growth.totalCheckinDays} 天</Text>
          </View>
          {growth.monthCalendar?.length > 0 && (
            <View style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: growth.trendHighlight ? `${spacing.sm}px` : 0 }}>
              {growth.monthCalendar.map((d) => (
                <View key={d.day} style={{
                  width: '18px', height: '18px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: d.future ? 'transparent' : (d.checked ? colors.primary : colors.border),
                  border: d.future ? `1px dashed ${colors.borderLight}` : 'none',
                }}>
                  <Text style={{ fontSize: '8px', color: d.checked ? '#fff' : colors.textMuted }}>{d.day}</Text>
                </View>
              ))}
            </View>
          )}
          {!!growth.trendHighlight && (
            <Text style={{ fontSize: '12px', color: colors.success }}>
              ✨ {growth.trendHighlight.label}从 {growth.trendHighlight.from} 变化到 {growth.trendHighlight.to}{growth.trendHighlight.unit}，趋势向好
            </Text>
          )}
        </View>

        {/* BMI 色带 */}
        {!!user?.height && (
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>⚖️ BMI 指数</Text>
              <Text style={{ fontSize: '16px', fontWeight: 800, color: bmiColor(bmi) }}>{bmi || '--'} · {bmiLabel(bmi)}</Text>
            </View>
            <View style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
              <View style={{ flex: 1, backgroundColor: colors.info }} />
              <View style={{ flex: 1.5, backgroundColor: colors.success }} />
              <View style={{ flex: 1, backgroundColor: colors.warning }} />
              <View style={{ flex: 1.5, backgroundColor: colors.danger }} />
            </View>
            <View style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <Text style={{ fontSize: '10px', color: colors.textMuted }}>偏瘦</Text>
              <Text style={{ fontSize: '10px', color: colors.textMuted }}>正常</Text>
              <Text style={{ fontSize: '10px', color: colors.textMuted }}>偏胖</Text>
              <Text style={{ fontSize: '10px', color: colors.textMuted }}>肥胖</Text>
            </View>
          </View>
        )}

        {/* 血压/血糖迷你走势图 */}
        {(bpTrend.length > 0 || bsTrend.length > 0) && (
          <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginBottom: `${spacing.md}px` }}>
            {bpTrend.length > 0 && (
              <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, boxShadow: shadow.card }}>
                <Text style={{ fontSize: '12px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '6px' }}>💗 血压趋势</Text>
                <TrendChart points={bpTrend} height={50} color={colors.danger} mini showValues={false} />
                <Text style={{ fontSize: '11px', color: colors.textMuted, marginTop: '4px' }}>最新 {bpTrend[bpTrend.length - 1]?.value} mmHg</Text>
              </View>
            )}
            {bsTrend.length > 0 && (
              <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, boxShadow: shadow.card }}>
                <Text style={{ fontSize: '12px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '6px' }}>🩸 血糖趋势</Text>
                <TrendChart points={bsTrend} height={50} color={colors.warning} mini showValues={false} />
                <Text style={{ fontSize: '11px', color: colors.textMuted, marginTop: '4px' }}>最新 {bsTrend[bsTrend.length - 1]?.value} mmol/L</Text>
              </View>
            )}
          </View>
        )}

        {/* 完成今日打卡（2026-07-18 打卡页重构对齐）：原内联打卡网格已抽离到独立页 pages/checkin/index，
            首页只保留入口按钮，健康管家团队卡片已移至"我的"页 */}
        <View onClick={() => Taro.navigateTo({ url: '/pages/checkin/index' })} style={{
          display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: colors.primary,
          borderRadius: `${radius.lg}px`, padding: `${spacing.md}px ${spacing.lg}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card,
        }}>
          <Text style={{ fontSize: '18px' }}>✅</Text>
          <Text style={{ flex: 1, fontSize: '15px', fontWeight: 700, color: '#fff' }}>完成今日打卡</Text>
          <Text style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)' }}>›</Text>
        </View>

        {/* 待办任务：2026-07-18 对齐app端Tab结构调整——"随访"已移出Tab，"全部"入口跳转独立随访页 */}
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>📋 待办事项</Text>
            <View onClick={() => Taro.navigateTo({ url: '/pages/tasks/index' })} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <Text style={{ fontSize: '13px', color: colors.primary, fontWeight: 500 }}>全部</Text>
              <Text style={{ fontSize: '13px', color: colors.primary }}>›</Text>
            </View>
          </View>
          {loading ? (
            <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
          ) : (tasks.length === 0 && followups.length === 0) ? (
            <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无待办事项</Text>
          ) : (
            <>
              {tasks.slice(0, 5).map((t) => (
                <View key={t._id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${colors.borderLight}` }}
                  onClick={() => setTaskDetail(t)}>
                  <Text style={{ flex: 1, fontSize: '14px', color: colors.textPrimary }}>{t.title}</Text>
                  <Text style={{ fontSize: '12px', color: colors.textMuted }}>{t.dueDate || ''}</Text>
                </View>
              ))}
              {followups.slice(0, 5).map((p) => (
                <View key={p._id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${colors.borderLight}` }}
                  onClick={() => setTaskDetail({ ...p, _isFollowup: true })}>
                  <Text style={{ flex: 1, fontSize: '14px', color: colors.textPrimary }}>{p.theme || '随访计划'}</Text>
                  <Text style={{ fontSize: '12px', color: colors.textMuted }}>{p.date ? new Date(p.date).toLocaleDateString('zh-CN') : ''}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* 快捷入口 */}
        <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginBottom: `${spacing.lg}px` }}>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, textAlign: 'center', boxShadow: shadow.card }}
            onClick={() => Taro.navigateTo({ url: '/pages/records/upload/index' })}>
            <Text style={{ fontSize: '22px', display: 'block' }}>📄</Text>
            <Text style={{ fontSize: '12px', color: colors.textPrimary, marginTop: '4px' }}>上传报告</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, textAlign: 'center', boxShadow: shadow.card }}
            onClick={() => Taro.navigateTo({ url: '/pages/chat/index' })}>
            <Text style={{ fontSize: '22px', display: 'block' }}>💬</Text>
            <Text style={{ fontSize: '12px', color: colors.textPrimary, marginTop: '4px' }}>AI健康助手</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, textAlign: 'center', boxShadow: shadow.card }}
            onClick={() => Taro.navigateTo({ url: '/pages/services/mall/index' })}>
            <Text style={{ fontSize: '22px', display: 'block' }}>🛒</Text>
            <Text style={{ fontSize: '12px', color: colors.textPrimary, marginTop: '4px' }}>服务商城</Text>
          </View>
        </View>
      </View>

      {taskDetail && (
        <TaskDetailModal task={taskDetail} onClose={() => setTaskDetail(null)} onDone={markTaskDone} />
      )}
    </ScrollView>
  );
}
