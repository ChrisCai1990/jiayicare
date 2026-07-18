import React, { useState, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import { colors, spacing, radius, shadow } from '../../../theme';
import { userAPI, recordsAPI } from '../../../services/api';
import TrendChart from '../../../components/TrendChart';

// 对齐 app/src/screens/records/HealthReportScreen.js 的核心信息：周期评分+指标趋势图化展示+任务完成率+亮点。
const TREND_ICON = { down: '↓', up: '↑', stable: '–' };

export default function HealthReportPage() {
  const [period, setPeriod] = useState('week');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState({});

  useEffect(() => {
    setLoading(true);
    userAPI.getReport(period).then((res) => {
      if (res.success) setReport(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    if (!report?.metrics?.length) return;
    const days = period === 'month' ? 30 : 7;
    Promise.allSettled(report.metrics.map((m) => recordsAPI.trend(m.type || m.key))).then((results) => {
      const next = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value?.data) {
          const m = report.metrics[i];
          next[m.type || m.key || m.label] = r.value.data.slice(-days).map((rec) => ({
            label: new Date(rec.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
            value: rec.extra?.sys || parseFloat(rec.value) || 0,
          }));
        }
      });
      setChartData(next);
    });
  }, [report, period]);

  const score = report?.healthScore ?? report?.score;

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${spacing.lg}px`, paddingBottom: `${spacing.xxl}px`, boxSizing: 'border-box' }}>
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
          <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.lg}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.card }}>
            <View>
              <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{report.periodLabel || (period === 'month' ? '本月报告' : '本周报告')}</Text>
              <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', margin: '4px 0' }}>{report.dateRange}</Text>
              {!!report.taskCompletion && (
                <Text style={{ fontSize: '12px', color: colors.textSecondary }}>☑ {report.taskCompletion.completed}/{report.taskCompletion.total} 任务完成（{report.taskCompletion.rate}%）</Text>
              )}
            </View>
            <View style={{
              width: '72px', height: '72px', borderRadius: '36px', border: `5px solid ${score >= 80 ? colors.success : score >= 60 ? colors.warning : colors.danger}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Text style={{ fontSize: '22px', fontWeight: 800, color: score >= 80 ? colors.success : score >= 60 ? colors.warning : colors.danger }}>{score ?? '--'}</Text>
              <Text style={{ fontSize: '10px', color: colors.textMuted }}>分</Text>
            </View>
          </View>

          {report.highlights?.length > 0 && (
            <View style={{ marginBottom: `${spacing.md}px` }}>
              <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>本期亮点</Text>
              <View style={{ backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, boxShadow: shadow.card }}>
                {report.highlights.map((h, i) => {
                  const icon = h.type === 'danger' ? '⚠️' : h.type === 'warning' ? '⚡' : '✅';
                  return (
                    <View key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: i < report.highlights.length - 1 ? '8px' : 0 }}>
                      <Text style={{ fontSize: '14px' }}>{icon}</Text>
                      <Text style={{ flex: 1, fontSize: '13px', color: colors.textSecondary, lineHeight: '19px' }}>{h.text}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {report.metrics?.length > 0 && (
            <View style={{ marginBottom: `${spacing.md}px` }}>
              <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>健康指标</Text>
              {report.metrics.map((m, i) => {
                const key = m.type || m.key || m.label;
                const points = chartData[key];
                const statusColor = m.status === 'normal' ? colors.success : m.status === 'warning' ? colors.warning : colors.danger;
                const trendColor = m.trend === 'down' ? colors.success : m.trend === 'up' ? colors.warning : colors.textMuted;
                return (
                  <View key={i} style={{ backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, marginBottom: '8px', boxShadow: shadow.card }}>
                    <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <Text style={{ fontSize: '14px', color: colors.textPrimary, fontWeight: 600 }}>{m.label}</Text>
                      <View style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Text style={{ fontSize: '16px', fontWeight: 800, color: statusColor }}>{m.value ?? m.displayValue}</Text>
                        <Text style={{ fontSize: '11px', color: colors.textMuted }}>{m.unit}</Text>
                        {!!m.delta && (
                          <Text style={{ fontSize: '11px', fontWeight: 600, color: trendColor, backgroundColor: trendColor + '20', padding: '2px 6px', borderRadius: `${radius.full}px` }}>{TREND_ICON[m.trend] || ''} {m.delta}</Text>
                        )}
                      </View>
                    </View>
                    {points?.length > 1 && <TrendChart points={points} height={70} color={statusColor} />}
                  </View>
                );
              })}
            </View>
          )}

          {!!report.recordCount && (
            <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, boxShadow: shadow.card }}>
              <Text style={{ fontSize: '18px' }}>📋</Text>
              <Text style={{ fontSize: '14px', color: colors.textSecondary }}>本期共记录 <Text style={{ fontSize: '16px', fontWeight: 800, color: colors.primary }}>{report.recordCount}</Text> 条健康数据</Text>
            </View>
          )}

          {Array.isArray(report.summary) && report.summary.map((item, i) => (
            <View key={i} style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: '8px', boxShadow: shadow.card, marginTop: `${spacing.sm}px` }}>
              <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{item.label || item.title}</Text>
              <Text style={{ fontSize: '12px', color: colors.textMuted }}>{item.desc || item.value}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
