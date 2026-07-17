import React, { useState, useCallback } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { tasksAPI, followupTasksAPI } from '../../services/api';

// 简化实现：待办任务 + 随访计划合并列表，完整版含分类Tab/表单填写见 app/src/screens/tasks/TasksScreen.js
export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, fRes] = await Promise.allSettled([tasksAPI.list(), followupTasksAPI.list()]);
      if (tRes.status === 'fulfilled' && tRes.value?.success) setTasks(tRes.value.data || []);
      if (fRes.status === 'fulfilled' && fRes.value?.success) setFollowups(fRes.value.data || []);
    } catch {}
    setLoading(false);
  }, []);

  useDidShow(() => { load(); });

  const completeTask = async (id) => {
    try { await tasksAPI.complete(id); load(); } catch {}
  };

  const doneFollowup = async (id) => {
    try { await followupTasksAPI.done(id, true, false); load(); } catch {}
  };

  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const pendingFollowups = followups.filter((p) => !p.completedByUser && !['completed', 'cancelled'].includes(p.status));

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${spacing.lg}px` }}>
      <Text style={{ fontSize: '20px', fontWeight: 800, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.md}px` }}>随访与待办</Text>

      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
      ) : (pendingTasks.length === 0 && pendingFollowups.length === 0) ? (
        <View style={{ textAlign: 'center', padding: `${spacing.xxl}px 0` }}>
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无待办事项，做得很好！</Text>
        </View>
      ) : (
        <>
          {pendingTasks.map((t) => (
            <View key={t._id} style={{
              backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: '10px', boxShadow: shadow.card,
            }}>
              <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{t.title}</Text>
                  <Text style={{ fontSize: '12px', color: colors.textMuted }}>{t.assignee || '医护团队'} · {t.dueDate || ''}</Text>
                </View>
                <View onClick={() => completeTask(t._id)} style={{ padding: '6px 14px', backgroundColor: colors.primary10, borderRadius: `${radius.full}px` }}>
                  <Text style={{ fontSize: '12px', color: colors.primary, fontWeight: 700 }}>完成</Text>
                </View>
              </View>
            </View>
          ))}
          {pendingFollowups.map((p) => (
            <View key={p._id} style={{
              backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: '10px', boxShadow: shadow.card,
            }}>
              <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{p.theme || '随访计划'}</Text>
                  <Text style={{ fontSize: '12px', color: colors.textMuted }}>
                    {p.staffId?.name || '医护团队'} · {p.date ? new Date(p.date).toLocaleDateString('zh-CN') : ''}
                  </Text>
                  {!!p.content && <Text style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '4px' }}>{p.content}</Text>}
                </View>
                <View onClick={() => doneFollowup(p._id)} style={{ padding: '6px 14px', backgroundColor: colors.primary10, borderRadius: `${radius.full}px` }}>
                  <Text style={{ fontSize: '12px', color: colors.primary, fontWeight: 700 }}>完成</Text>
                </View>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
