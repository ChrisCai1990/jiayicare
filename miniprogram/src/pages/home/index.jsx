import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { userAPI, recordsAPI, tasksAPI, followupTasksAPI } from '../../services/api';

// 首页简化实现：问候卡+健康评分+今日打卡进度+待办列表，接真实后端数据。
// 完整版 app/src/screens/home/HomeScreen.js 含大量图表/成长卡片/多类型打卡弹窗(1800+行)，
// 小程序端按「核心链路完整可跑通」原则做了简化，详见 miniprogram/CLAUDE.md 的"简化实现"清单。

const CHECKIN_ITEMS = [
  { key: 'diet', label: '饮食', icon: '🍽️', allowMultiple: true },
  { key: 'exercise', label: '运动', icon: '🏃', allowMultiple: true },
  { key: 'sleep', label: '睡眠', icon: '🌙' },
  { key: 'weight', label: '体重', icon: '⚖️' },
  { key: 'bowel', label: '排便', icon: '🍃' },
  { key: 'water', label: '饮水', icon: '💧' },
  { key: 'bloodPressure', label: '血压', icon: '💗', allowMultiple: true },
  { key: 'heartRate', label: '心率', icon: '❤️' },
  { key: 'bloodSugar', label: '血糖', icon: '🩸', allowMultiple: true },
];

export default function HomePage() {
  const { user: authUser } = useAuth();
  const [dashData, setDashData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [todayTypes, setTodayTypes] = useState(new Set());

  const loadData = useCallback(async () => {
    try {
      const [dashRes, tasksRes, followRes, todayRes] = await Promise.allSettled([
        userAPI.getDashboard(),
        tasksAPI.list(),
        followupTasksAPI.list(),
        recordsAPI.list({ days: 1, limit: 50 }),
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
    } catch {}
    setLoading(false);
  }, []);

  useDidShow(() => { loadData(); });
  usePullDownRefresh(() => { loadData().then(() => Taro.stopPullDownRefresh()); });

  const user = { ...(dashData?.user || {}), ...(authUser || {}) };
  const hasData = dashData?.has_any_health_data ?? false;
  const score = user?.healthScore || 0;
  const name = user?.name || '用户';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  const doneCount = CHECKIN_ITEMS.filter((i) => todayTypes.has(i.key)).length;

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
        <View style={{
          backgroundColor: '#1E6B50', borderRadius: `${radius.lg}px`, padding: `${spacing.lg}px`, marginBottom: `${spacing.md}px`,
        }}>
          <Text style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>{greeting}</Text>
          <Text style={{ fontSize: '20px', fontWeight: 700, color: '#fff', display: 'block', marginTop: '4px' }}>{name}，继续保持 💪</Text>
          <View style={{ display: 'flex', alignItems: 'baseline', marginTop: `${spacing.md}px` }}>
            <Text style={{ fontSize: '40px', fontWeight: 800, color: '#fff' }}>{hasData ? score : '--'}</Text>
            <Text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginLeft: '8px' }}>
              {hasData ? '健康评分 / 100' : '暂无评分，请录入数据'}
            </Text>
          </View>
        </View>

        {/* 今日打卡 */}
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>✅ 今日健康打卡</Text>
            <Text style={{ fontSize: '13px', color: colors.textMuted }}>{doneCount}/{CHECKIN_ITEMS.length}</Text>
          </View>
          <View style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {CHECKIN_ITEMS.map((item) => {
              const done = todayTypes.has(item.key);
              return (
                <View
                  key={item.key}
                  onClick={() => {
                    // 今日已打卡且不允许多次的项目直接拦截，防止重复写入同一天多条记录（2026-07-17）
                    if (done && !item.allowMultiple) {
                      Taro.showToast({ title: '今天已经打过卡了，明天再来吧～', icon: 'none' });
                      return;
                    }
                    Taro.navigateTo({ url: `/pages/records/add/index?type=${item.key}` });
                  }}
                  style={{
                    width: 'calc(33.33% - 7px)', padding: '10px 0', borderRadius: `${radius.sm}px`, textAlign: 'center',
                    backgroundColor: done ? colors.primary10 : colors.background,
                    border: `1px solid ${done ? colors.primary + '40' : colors.border}`,
                  }}
                >
                  <Text style={{ fontSize: '18px', display: 'block' }}>{item.icon}</Text>
                  <Text style={{ fontSize: '11px', color: done ? colors.primary : colors.textSecondary, fontWeight: done ? 700 : 500 }}>{item.label}</Text>
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
                  onClick={() => Taro.switchTab({ url: '/pages/tasks/index' })}>
                  <Text style={{ flex: 1, fontSize: '14px', color: colors.textPrimary }}>{t.title}</Text>
                  <Text style={{ fontSize: '12px', color: colors.textMuted }}>{t.dueDate || ''}</Text>
                </View>
              ))}
              {followups.slice(0, 5).map((p) => (
                <View key={p._id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${colors.borderLight}` }}
                  onClick={() => Taro.switchTab({ url: '/pages/tasks/index' })}>
                  <Text style={{ flex: 1, fontSize: '14px', color: colors.textPrimary }}>{p.theme || '随访计划'}</Text>
                  <Text style={{ fontSize: '12px', color: colors.textMuted }}>{p.date ? new Date(p.date).toLocaleDateString('zh-CN') : ''}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* 快捷入口 */}
        <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginBottom: `${spacing.lg}px` }}>
          <View
            style={{ flex: 1, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, textAlign: 'center', boxShadow: shadow.card }}
            onClick={() => Taro.navigateTo({ url: '/pages/records/upload/index' })}
          >
            <Text style={{ fontSize: '22px', display: 'block' }}>📄</Text>
            <Text style={{ fontSize: '12px', color: colors.textPrimary, marginTop: '4px' }}>上传报告</Text>
          </View>
          <View
            style={{ flex: 1, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, textAlign: 'center', boxShadow: shadow.card }}
            onClick={() => Taro.navigateTo({ url: '/pages/chat/index' })}
          >
            <Text style={{ fontSize: '22px', display: 'block' }}>💬</Text>
            <Text style={{ fontSize: '12px', color: colors.textPrimary, marginTop: '4px' }}>AI健康助手</Text>
          </View>
          <View
            style={{ flex: 1, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, textAlign: 'center', boxShadow: shadow.card }}
            onClick={() => Taro.navigateTo({ url: '/pages/services/mall/index' })}
          >
            <Text style={{ fontSize: '22px', display: 'block' }}>🛒</Text>
            <Text style={{ fontSize: '12px', color: colors.textPrimary, marginTop: '4px' }}>服务商城</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
