import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { tasksAPI, followupTasksAPI } from '../../services/api';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';

const TIME_TABS = ['全部', '今日', '本周', '本月'];

const dateOf = item => item.dueDate || item.date || item.scheduledAt || item.createdAt;
const dateKey = item => dateOf(item) ? String(dateOf(item)).slice(0, 10) : '';

export default function TasksPage() {
  const { statusBarHeight } = useNavBar();
  const [tasks, setTasks] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [timeFilter, setTimeFilter] = useState('全部');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [tRes, fRes] = await Promise.allSettled([tasksAPI.list(), followupTasksAPI.list()]);
    if (tRes.status === 'fulfilled' && tRes.value?.success) setTasks(tRes.value.data || []);
    if (fRes.status === 'fulfilled' && fRes.value?.success) setFollowups(fRes.value.data || []);
    setLoading(false);
  }, []);
  useDidShow(load);

  const completeTask = async (id) => { try { await tasksAPI.complete(id); load(); } catch {} };
  const doneFollowup = async (id) => {
    try {
      const result = await Taro.showActionSheet({ itemList: ['仍需健管专员跟进', '无需跟进，标记完成'] });
      const needFollowUp = result.tapIndex === 0;
      await followupTasksAPI.done(id, true, needFollowUp);
      Taro.showToast({ title: needFollowUp ? '已通知健管专员跟进' : '已完成', icon: 'success' });
      load();
    } catch (err) {
      if (!/cancel/i.test(err?.errMsg || '')) Taro.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  };

  const normalized = [
    ...tasks.map(t => ({ ...t, _kind: 'task', _status: t.status === 'cancelled' ? 'cancelled' : t.status === 'completed' ? 'done' : 'active' })),
    ...followups.map(f => ({ ...f, _kind: 'followup', _status: f.status === 'cancelled' ? 'cancelled' : (f.completedByUser || f.status === 'completed') ? 'done' : 'active' })),
  ];
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
  const monthEnd = new Date(today); monthEnd.setMonth(today.getMonth() + 1);
  const visible = normalized.filter(item => {
    if (item._status !== 'active') return false;
    if (timeFilter === '全部') return true;
    const key = dateKey(item);
    if (!key) return true;
    if (timeFilter === '今日') return key <= todayKey;
    if (timeFilter === '本周') return new Date(key) <= weekEnd;
    return new Date(key) <= monthEnd;
  });

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`, backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}` }}>
        <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}><Icon name="chevron-left" size={20} color={colors.textPrimary} /></View>
        <View style={{ textAlign: 'center' }}><Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>待办任务</Text><Text style={{ fontSize: '11px', color: colors.textMuted }}>健康管理进度跟踪</Text></View>
        <View style={{ width: '28px' }} />
      </View>
      <View style={{ padding: `${spacing.md}px ${spacing.lg}px 0` }}>
        <ScrollView scrollX style={{ whiteSpace: 'nowrap', marginBottom: `${spacing.md}px` }}><View style={{ display: 'inline-flex', gap: '8px' }}>
          {TIME_TABS.map(tab => <View key={tab} onClick={() => setTimeFilter(tab)} style={{ padding: '6px 14px', borderRadius: `${radius.full}px`, backgroundColor: timeFilter === tab ? colors.primary10 : '#fff', border: `1px solid ${timeFilter === tab ? colors.primary : colors.border}` }}><Text style={{ fontSize: '12px', color: timeFilter === tab ? colors.primary : colors.textSecondary }}>{tab}</Text></View>)}
        </View></ScrollView>
        {loading ? <Text style={{ color: colors.textMuted }}>加载中...</Text> : visible.length === 0 ? <View style={{ textAlign: 'center', padding: `${spacing.xxl}px 0` }}><Text style={{ color: colors.textMuted }}>暂无待办任务</Text></View> : visible.map(item => (
          <View key={`${item._kind}-${item._id}`} style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: '10px', boxShadow: shadow.card }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '14px', fontWeight: 700, color: item.sourceType === 'symptom' ? colors.danger : colors.textPrimary, display: 'block' }}>{item.sourceType === 'symptom' ? '不适主诉待健康顾问处理' : (item.title || item.theme || '随访计划')}</Text>
                <Text style={{ fontSize: '12px', color: colors.textMuted }}>{item.staffId?.name || item.assignee || '健康管理团队'} · {dateKey(item)}</Text>
                {!!item.content && <Text style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '4px' }}>{item.content}</Text>}
              </View>
              <View onClick={() => item._kind === 'followup' ? doneFollowup(item._id) : completeTask(item._id)} style={{ padding: '7px 14px', backgroundColor: colors.primary10, borderRadius: `${radius.full}px` }}><Text style={{ fontSize: '12px', color: colors.primary, fontWeight: 700 }}>完成</Text></View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
