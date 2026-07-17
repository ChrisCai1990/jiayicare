import React, { useState, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import { colors, spacing, radius, shadow } from '../../../theme';
import { userAPI } from '../../../services/api';

// 简化实现：健康报告摘要（周期评分+关键指标），完整版含图表见 app/src/screens/records/HealthReportScreen.js
export default function HealthReportPage() {
  const [period, setPeriod] = useState('week');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    userAPI.getReport(period).then((res) => {
      if (res.success) setReport(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${spacing.lg}px` }}>
      <View style={{ display: 'flex', gap: '8px', marginBottom: `${spacing.lg}px` }}>
        {[{ k: 'week', l: '本周' }, { k: 'month', l: '本月' }].map((p) => (
          <View
            key={p.k}
            onClick={() => setPeriod(p.k)}
            style={{
              flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: `${radius.md}px`,
              backgroundColor: period === p.k ? colors.primary : '#fff',
              border: `1px solid ${period === p.k ? colors.primary : colors.border}`,
            }}
          >
            <Text style={{ fontSize: '14px', color: period === p.k ? '#fff' : colors.textPrimary, fontWeight: 600 }}>{p.l}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
      ) : !report ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无报告数据</Text>
      ) : (
        <>
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.lg}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card, textAlign: 'center' }}>
            <Text style={{ fontSize: '13px', color: colors.textMuted }}>健康评分</Text>
            <Text style={{ fontSize: '40px', fontWeight: 800, color: colors.primary, display: 'block' }}>{report.score ?? report.healthScore ?? '--'}</Text>
          </View>
          {Array.isArray(report.summary) && report.summary.map((item, i) => (
            <View key={i} style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: '8px', boxShadow: shadow.card }}>
              <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{item.label || item.title}</Text>
              <Text style={{ fontSize: '12px', color: colors.textMuted }}>{item.desc || item.value}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
