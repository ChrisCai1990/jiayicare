import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { recordsAPI } from '../../../services/api';

const TYPE_META = {
  bloodPressure: { label: '血压', icon: '💗', unit: 'mmHg' },
  bloodSugar: { label: '血糖', icon: '🩸', unit: 'mmol/L' },
  heartRate: { label: '心率', icon: '❤️', unit: '次/分' },
  weight: { label: '体重', icon: '⚖️', unit: 'kg' },
  sleep: { label: '睡眠', icon: '🌙', unit: '小时' },
  mood: { label: '情绪', icon: '😊', unit: '分' },
};

const STATUS_COLOR = { normal: colors.success, warning: colors.warning, low: colors.info };

export default function RecordsIndexPage() {
  const [records, setRecords] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await recordsAPI.list({ limit: 50 });
      if (res.success) setRecords(res.data || []);
    } catch {}
    setLoading(false);
  }, []);

  useDidShow(() => { load(); });

  const filtered = filter === 'all' ? records : records.filter((r) => r.type === filter);

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{ padding: `${spacing.lg}px ${spacing.lg}px 0` }}>
        <Text style={{ fontSize: '20px', fontWeight: 800, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.md}px` }}>健康档案</Text>

        <ScrollView scrollX style={{ whiteSpace: 'nowrap', marginBottom: `${spacing.md}px` }}>
          <View style={{ display: 'inline-flex', gap: '8px' }}>
            {['all', ...Object.keys(TYPE_META)].map((k) => (
              <View
                key={k}
                onClick={() => setFilter(k)}
                style={{
                  display: 'inline-block', padding: '6px 14px', borderRadius: `${radius.full}px`,
                  backgroundColor: filter === k ? colors.primary : '#fff',
                  border: `1px solid ${filter === k ? colors.primary : colors.border}`,
                }}
              >
                <Text style={{ fontSize: '12px', color: filter === k ? '#fff' : colors.textPrimary, fontWeight: 600 }}>
                  {k === 'all' ? '全部' : `${TYPE_META[k].icon} ${TYPE_META[k].label}`}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            backgroundColor: colors.primary, borderRadius: `${radius.md}px`, padding: '12px 0', marginBottom: `${spacing.md}px`,
          }}
          onClick={() => Taro.navigateTo({ url: '/pages/records/add/index' })}
        >
          <Text style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>+ 录入健康数据</Text>
        </View>

        <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginBottom: `${spacing.md}px` }}>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: '12px', textAlign: 'center', boxShadow: shadow.card }}
            onClick={() => Taro.navigateTo({ url: '/pages/records/report/index' })}>
            <Text style={{ fontSize: '20px', display: 'block' }}>📊</Text>
            <Text style={{ fontSize: '12px', color: colors.textPrimary, marginTop: '4px' }}>健康报告</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: '12px', textAlign: 'center', boxShadow: shadow.card }}
            onClick={() => Taro.navigateTo({ url: '/pages/records/upload/index' })}>
            <Text style={{ fontSize: '20px', display: 'block' }}>📄</Text>
            <Text style={{ fontSize: '12px', color: colors.textPrimary, marginTop: '4px' }}>体检报告</Text>
          </View>
        </View>
      </View>

      <View style={{ padding: `0 ${spacing.lg}px` }}>
        {loading ? (
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
        ) : filtered.length === 0 ? (
          <View style={{ textAlign: 'center', padding: `${spacing.xxl}px 0` }}>
            <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无记录，点击上方按钮开始录入</Text>
          </View>
        ) : (
          filtered.map((r) => {
            const meta = TYPE_META[r.type] || { label: r.label || r.type, icon: '📋', unit: r.unit || '' };
            return (
              <View key={r._id} style={{
                display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: `${radius.md}px`,
                padding: `${spacing.md}px`, marginBottom: '8px', boxShadow: shadow.card,
              }}>
                <Text style={{ fontSize: '22px', marginRight: `${spacing.sm}px` }}>{meta.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{r.label || meta.label}</Text>
                  <Text style={{ fontSize: '11px', color: colors.textMuted }}>
                    {r.recordedAt ? new Date(r.recordedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: '16px', fontWeight: 700, color: STATUS_COLOR[r.status] || colors.textPrimary }}>
                  {r.value} {r.unit || meta.unit}
                </Text>
              </View>
            );
          })
        )}
      </View>
      <View style={{ height: '20px' }} />
    </View>
  );
}
