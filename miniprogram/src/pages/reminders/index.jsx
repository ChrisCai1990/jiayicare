import React, { useState, useCallback } from 'react';
import { View, Text, Switch } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { remindersAPI } from '../../services/api';

// 简化实现：提醒列表 + 开关切换，完整版含新增/分类见 app/src/screens/reminders/RemindersScreen.js
export default function RemindersPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    remindersAPI.list().then((res) => { if (res.success) setList(res.data || []); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  useDidShow(() => { load(); });

  const toggle = async (id) => {
    try { await remindersAPI.toggle(id); load(); } catch {}
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${spacing.lg}px` }}>
      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
      ) : list.length === 0 ? (
        <View style={{ textAlign: 'center', padding: `${spacing.xxl}px 0` }}>
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无提醒</Text>
        </View>
      ) : (
        list.map((r) => (
          <View key={r._id} style={{
            display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: `${radius.md}px`,
            padding: `${spacing.md}px`, marginBottom: '10px', boxShadow: shadow.card,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{r.title}</Text>
              <Text style={{ fontSize: '12px', color: colors.textMuted }}>{r.reminderTime || ''}</Text>
            </View>
            <Switch checked={r.enabled} onChange={() => toggle(r._id)} color={colors.primary} />
          </View>
        ))
      )}
    </View>
  );
}
