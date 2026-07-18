import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, Input, Picker } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { userAPI, recordsAPI, tasksAPI, followupTasksAPI, systemAPI } from '../../services/api';
import TrendChart from '../../components/TrendChart';

// 对齐 app/src/screens/home/HomeScreen.js（1919行）的核心交互，图表用轻量div实现（非SVG/canvas）。
// 打卡项已补全到12项（新增"吸烟""饮酒"）。血压/血糖迷你走势图、BMI色带、成长打卡卡片（连续天数+月历）、
// 任务详情弹窗、健康管家团队卡片、情绪圆点选分、生理指标原地打卡弹窗均已实现，接真实数据。
// 简化点：月历用简单圆点网格而非app端的日历UI组件；任务详情弹窗字段展示做了精简。
const CHECKIN_ITEMS = [
  { key: 'diet', label: '饮食', icon: '🍽️', allowMultiple: true, vital: false },
  { key: 'exercise', label: '运动', icon: '🏃', allowMultiple: true, vital: false },
  { key: 'sleep', label: '睡眠', icon: '🌙', vital: true },
  { key: 'weight', label: '体重', icon: '⚖️', vital: true },
  { key: 'bowel', label: '排便', icon: '🍃', allowMultiple: true, vital: false },
  { key: 'water', label: '饮水', icon: '💧', allowMultiple: true, vital: false },
  { key: 'bloodPressure', label: '血压', icon: '💗', allowMultiple: true, vital: true },
  { key: 'heartRate', label: '心率', icon: '❤️', vital: true },
  { key: 'bloodSugar', label: '血糖', icon: '🩸', allowMultiple: true, vital: true },
  { key: 'mood', label: '情绪', icon: '😊', vital: true },
  { key: 'smoking', label: '吸烟', icon: '🚬', allowMultiple: true, vital: true },
  { key: 'drinking', label: '饮酒', icon: '🍷', allowMultiple: true, vital: true },
];

const MEAL_OPTIONS = ['早餐', '午餐', '晚餐', '加餐'];
const CARE_ROLE_META = {
  familyDoctor: { label: '家庭医师', icon: '🩺', color: colors.primary },
  nutritionist: { label: '营养师', icon: '🥗', color: '#059669' },
  healthManager: { label: '健管师', icon: '🧑‍💼', color: '#D97706' },
};

// 原地打卡弹窗：不跳转录入页，直接填写提交（对齐app端）
function QuickCheckinModal({ item, onClose, onSaved }) {
  const [value, setValue] = useState('');
  const [sys, setSys] = useState('');
  const [dia, setDia] = useState('');
  const [moodScore, setMoodScore] = useState(7);
  const [meal, setMeal] = useState('早餐');
  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      let payload;
      if (item.key === 'bloodPressure') {
        const s = parseInt(sys, 10), d = parseInt(dia, 10);
        if (!s || !d) { Taro.showToast({ title: '请填写完整血压值', icon: 'none' }); setSaving(false); return; }
        payload = { type: 'bloodPressure', category: 'vitals', label: '血压', unit: 'mmHg', value: `${s}/${d}`, extra: { sys: s, dia: d }, status: s >= 140 || d >= 90 ? 'warning' : 'normal' };
      } else if (item.key === 'mood') {
        payload = { type: 'mood', category: 'lifestyle', label: '情绪', unit: '分', value: String(moodScore), status: 'normal' };
      } else if (item.key === 'diet') {
        if (!value.trim()) { Taro.showToast({ title: '请填写饮食内容', icon: 'none' }); setSaving(false); return; }
        payload = { type: 'diet', category: 'lifestyle', label: '饮食', unit: '', value: value.trim(), extra: { meal }, status: 'normal', recordedAt: recordDate ? new Date(recordDate).toISOString() : undefined };
      } else {
        if (!value) { Taro.showToast({ title: '请填写数值', icon: 'none' }); setSaving(false); return; }
        const num = parseFloat(value);
        let status = 'normal';
        if (item.key === 'bloodSugar') status = num > 7 ? 'warning' : num < 3.9 ? 'low' : 'normal';
        else if (item.key === 'heartRate') status = num > 100 ? 'warning' : num < 60 ? 'low' : 'normal';
        else if (item.key === 'smoking' || item.key === 'drinking') status = num > 0 ? 'warning' : 'normal';
        payload = { type: item.key, category: item.vital ? 'vitals' : 'lifestyle', label: item.label, unit: '', value: String(value), status };
      }
      await recordsAPI.create(payload);
      Taro.showToast({ title: '打卡成功', icon: 'success' });
      onSaved();
      onClose();
    } catch (e) {
      Taro.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <View style={{ backgroundColor: '#fff', borderRadius: '24px 24px 0 0', padding: `${spacing.lg}px`, width: '100%', boxSizing: 'border-box' }}>
        <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '0 auto 16px' }} />
        <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.md}px` }}>{item.icon} {item.label}打卡</Text>

        {item.key === 'bloodPressure' ? (
          <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginBottom: `${spacing.md}px` }}>
            <Input type="number" style={{ flex: 1, border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', boxSizing: 'border-box' }} placeholder="收缩压" value={sys} onInput={(e) => setSys(e.detail.value)} />
            <Input type="number" style={{ flex: 1, border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', boxSizing: 'border-box' }} placeholder="舒张压" value={dia} onInput={(e) => setDia(e.detail.value)} />
          </View>
        ) : item.key === 'mood' ? (
          <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: `${spacing.md}px` }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <View key={n} onClick={() => setMoodScore(n)} style={{
                width: '32px', height: '32px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: moodScore === n ? colors.primary : colors.background, border: `1px solid ${moodScore === n ? colors.primary : colors.border}`,
              }}>
                <Text style={{ fontSize: '13px', color: moodScore === n ? '#fff' : colors.textPrimary, fontWeight: moodScore === n ? 700 : 400 }}>{n}</Text>
              </View>
            ))}
          </View>
        ) : item.key === 'diet' ? (
          <>
            <View style={{ display: 'flex', gap: '8px', marginBottom: `${spacing.sm}px` }}>
              {MEAL_OPTIONS.map((m) => (
                <View key={m} onClick={() => setMeal(m)} style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: `${radius.sm}px`, backgroundColor: meal === m ? colors.primary : colors.background, border: `1px solid ${meal === m ? colors.primary : colors.border}` }}>
                  <Text style={{ fontSize: '12px', color: meal === m ? '#fff' : colors.textSecondary, fontWeight: meal === m ? 700 : 400 }}>{m}</Text>
                </View>
              ))}
            </View>
            <Input style={{ border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', marginBottom: `${spacing.sm}px`, boxSizing: 'border-box', width: '100%' }} placeholder="吃了什么？如：燕麦粥+鸡蛋" value={value} onInput={(e) => setValue(e.detail.value)} />
            <Picker mode="date" value={recordDate} onChange={(e) => setRecordDate(e.detail.value)}>
              <View style={{ border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', marginBottom: `${spacing.md}px` }}>
                <Text style={{ fontSize: '13px', color: colors.textSecondary }}>补录日期：{recordDate}</Text>
              </View>
            </Picker>
          </>
        ) : (
          <Input type="digit" style={{ border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', marginBottom: `${spacing.md}px`, boxSizing: 'border-box', width: '100%' }} placeholder={`请输入${item.label}数值`} value={value} onInput={(e) => setValue(e.detail.value)} />
        )}

        <View style={{ display: 'flex', gap: `${spacing.sm}px` }}>
          <View onClick={onClose} style={{ flex: 1, textAlign: 'center', padding: '12px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }}>
            <Text style={{ fontSize: '14px', color: colors.textSecondary, fontWeight: 600 }}>取消</Text>
          </View>
          <View onClick={saving ? undefined : submit} style={{ flex: 2, textAlign: 'center', padding: '12px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }}>
            <Text style={{ fontSize: '14px', color: '#fff', fontWeight: 700 }}>{saving ? '提交中...' : '提交打卡'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

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
  const [todayTypes, setTodayTypes] = useState(new Set());
  const [bpTrend, setBpTrend] = useState([]);
  const [bsTrend, setBsTrend] = useState([]);
  const [quickCheckinItem, setQuickCheckinItem] = useState(null);
  const [taskDetail, setTaskDetail] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [dashRes, tasksRes, followRes, todayRes, bpRes, bsRes] = await Promise.allSettled([
        userAPI.getDashboard(),
        tasksAPI.list(),
        followupTasksAPI.list(),
        recordsAPI.list({ days: 1, limit: 50 }),
        recordsAPI.trend('bloodPressure'),
        recordsAPI.trend('bloodSugar'),
      ]);
      if (dashRes.status === 'fulfilled' && dashRes.value?.success) setDashData(dashRes.value.data);
      if (tasksRes.status === 'fulfilled' && tasksRes.value?.success) {
        setTasks((tasksRes.value.data || []).filter((t) => t.status === 'pending'));
      }
      if (followRes.status === 'fulfilled' && followRes.value?.success) {
        setFollowups((followRes.value.data || []).filter((p) => !p.completedByUser && !['completed', 'cancelled'].includes(p.status)));
      }
      if (todayRes.status === 'fulfilled' && todayRes.value?.data) {
        const now = new Date();
        const sameDay = (d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
        setTodayTypes(new Set(todayRes.value.data.filter((r) => r.recordedAt && sameDay(new Date(r.recordedAt))).map((r) => r.type)));
      }
      if (bpRes.status === 'fulfilled' && bpRes.value?.data) {
        setBpTrend(bpRes.value.data.slice(-7).map((r) => ({ label: new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }), value: r.extra?.sys || parseFloat(r.value) || 0 })));
      }
      if (bsRes.status === 'fulfilled' && bsRes.value?.data) {
        setBsTrend(bsRes.value.data.slice(-7).map((r) => ({ label: new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }), value: parseFloat(r.value) || 0 })));
      }
    } catch {}
    setLoading(false);
  }, []);

  useDidShow(() => { loadData(); });
  usePullDownRefresh(() => { loadData().then(() => Taro.stopPullDownRefresh()); });

  // 首页额外调用 systemAPI.push()：触发后端系统消息推送(打卡提醒/复查提醒等)，fire-and-forget不阻塞首页渲染
  useEffect(() => { systemAPI.push().catch(() => {}); }, []);

  const user = { ...(dashData?.user || {}), ...(authUser || {}) };
  const hasData = dashData?.has_any_health_data ?? false;
  const score = user?.healthScore || 0;
  const name = user?.name || '用户';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const doneCount = CHECKIN_ITEMS.filter((i) => todayTypes.has(i.key)).length;
  const bmi = dashData?.bmi;
  const growth = dashData?.growth || { streak: 0, totalCheckinDays: 0, monthCalendar: [], trendHighlight: null };
  const careTeam = user?.careTeam || [];

  const handleCheckinClick = (item) => {
    if (todayTypes.has(item.key) && !item.allowMultiple) {
      Taro.showToast({ title: '今天已经打过卡了，明天再来吧～', icon: 'none' });
      return;
    }
    // 生理指标/情绪/饮食支持原地打卡弹窗；其余（运动/排便/饮水）跳转录入页（结构较简单，跳转体验差异不大）
    if (item.vital || item.key === 'mood' || item.key === 'diet') {
      setQuickCheckinItem(item);
    } else {
      Taro.navigateTo({ url: `/pages/records/add/index?type=${item.key}` });
    }
  };

  const markTaskDone = async () => {
    if (!taskDetail) return;
    try {
      if (taskDetail._isFollowup) await followupTasksAPI.done(taskDetail._id, true, false);
      else await tasksAPI.complete(taskDetail._id);
      Taro.showToast({ title: '已完成', icon: 'success' });
      setTaskDetail(null);
      loadData();
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

        {/* 健康管家团队横向卡片 */}
        {careTeam.length > 0 && (
          <ScrollView scrollX style={{ whiteSpace: 'nowrap', marginBottom: `${spacing.md}px` }}>
            {careTeam.map((m) => {
              const meta = CARE_ROLE_META[m.kind] || { label: m.role, icon: '👤', color: colors.primary };
              return (
                <View key={m.kind} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: '10px 14px', marginRight: '8px', boxShadow: shadow.card }}>
                  <View style={{ width: '32px', height: '32px', borderRadius: '16px', backgroundColor: meta.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: '15px' }}>{meta.icon}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{m.name}</Text>
                    <Text style={{ fontSize: '10px', color: colors.textMuted }}>{meta.label}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* 今日打卡（12项） */}
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>✅ 今日健康打卡</Text>
            <Text style={{ fontSize: '13px', color: colors.textMuted }}>{doneCount}/{CHECKIN_ITEMS.length}</Text>
          </View>
          <View style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {CHECKIN_ITEMS.map((item) => {
              const done = todayTypes.has(item.key);
              return (
                <View key={item.key} onClick={() => handleCheckinClick(item)} style={{
                  width: 'calc(25% - 8px)', padding: '10px 0', borderRadius: `${radius.sm}px`, textAlign: 'center',
                  backgroundColor: done ? colors.primary10 : colors.background,
                  border: `1px solid ${done ? colors.primary + '40' : colors.border}`,
                }}>
                  <Text style={{ fontSize: '16px', display: 'block' }}>{item.icon}</Text>
                  <Text style={{ fontSize: '10px', color: done ? colors.primary : colors.textSecondary, fontWeight: done ? 700 : 500 }}>{item.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* 待办任务 */}
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card }}>
          <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, marginBottom: `${spacing.sm}px`, display: 'block' }}>📋 待办事项</Text>
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

      {quickCheckinItem && (
        <QuickCheckinModal item={quickCheckinItem} onClose={() => setQuickCheckinItem(null)} onSaved={loadData} />
      )}
      {taskDetail && (
        <TaskDetailModal task={taskDetail} onClose={() => setTaskDetail(null)} onDone={markTaskDone} />
      )}
    </ScrollView>
  );
}
