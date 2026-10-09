import React, { useState, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { userAPI, recordsAPI } from '../../../services/api';
import TrendChart from '../../../components/TrendChart';
import BloodPressureChart from '../../../components/BloodPressureChart';
import { recordsWithinDays } from '../../../utils/reportTrend';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

// 对齐 app/src/screens/records/HealthReportScreen.js 的核心信息：周期评分+指标趋势图化展示+任务完成率+亮点。
const TREND_ICON = { down: '↓', up: '↑', stable: '–' };
const bloodPressureArm = record => {
  const arm = record?.arm || record?.extra?.arm || record?.note || '';
  if (/左[臂手]/.test(arm)) return '左臂';
  if (/右[臂手]/.test(arm)) return '右臂';
  return '未标注手臂';
};
const recordDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未记录' : `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export default function HealthReportPage() {
  const { statusBarHeight } = useNavBar();
  const [period, setPeriod] = useState('week');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState({});
  const [showRecords, setShowRecords] = useState(false);
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState('');

  useEffect(() => {
    setLoading(true);
    setReport(null);
    setShowRecords(false);
    userAPI.getReport(period).then((res) => {
      if (res.success) setReport(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    if (!report) return;
    let active = true;
    setRecords([]);
    setRecordsError('');
    setRecordsLoading(true);
    (async () => {
      const all = [];
      for (let page = 1; page <= 20; page += 1) {
        const result = await recordsAPI.list({ days: period === 'month' ? 30 : 7, limit: 100, page });
        if (!result.success || !Array.isArray(result.data)) throw new Error('健康记录加载失败');
        all.push(...result.data);
        if (result.data.length < 100) break;
      }
      if (active) setRecords(all.filter(record => ['bloodPressure', 'bloodSugar', 'heartRate', 'weight'].includes(record.type)));
    })().catch(() => { if (active) setRecordsError('明细加载失败，请稍后重试'); })
      .finally(() => { if (active) setRecordsLoading(false); });
    return () => { active = false; };
  }, [report, period]);

  useEffect(() => {
    if (!report?.metrics?.length) return;
    const days = period === 'month' ? 30 : 7;
    Promise.allSettled(report.metrics.map((m) => recordsAPI.trend(m.type || m.key))).then((results) => {
      const next = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value?.data) {
          const m = report.metrics[i];
          next[m.type || m.key || m.label] = recordsWithinDays(r.value.data, days).map((rec) => ({
            label: `${new Date(rec.recordedAt).getMonth() + 1}/${new Date(rec.recordedAt).getDate()}`,
            value: rec.extra?.sys || parseFloat(rec.value) || 0,
            arm: m.type === 'bloodPressure' ? bloodPressureArm(rec) : '',
          }));
        }
      });
      setChartData(next);
    });
  }, [report, period]);

  const score = report?.healthScore ?? report?.score;
  const bpRecords = records.filter(record => record.type === 'bloodPressure');
  const bpByArm = ['左臂', '右臂'].map(arm => ({ arm, record: bpRecords.find(record => bloodPressureArm(record) === arm) })).filter(item => item.record);

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`,
        backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`,
      }}>
        <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>健康报告</Text>
        <View style={{ width: '28px' }} />
      </View>

      <View style={{ padding: `${spacing.lg}px`, paddingBottom: `${spacing.xxl}px`, boxSizing: 'border-box' }}>
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
                        {!!m.delta && (m.type !== 'bloodPressure' || bpByArm.length === 0) && (
                          <Text style={{ fontSize: '11px', fontWeight: 600, color: trendColor, backgroundColor: trendColor + '20', padding: '2px 6px', borderRadius: `${radius.full}px` }}>{TREND_ICON[m.trend] || ''} {m.delta}</Text>
                        )}
                      </View>
                    </View>
                    {m.type === 'bloodPressure' && bpByArm.length > 0 && (
                      <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                        {bpByArm.map(({ arm, record }) => <Text key={arm} style={{ fontSize: '12px', color: colors.textSecondary, backgroundColor: colors.background, padding: '5px 8px', borderRadius: `${radius.sm}px` }}>{arm} {record.value} mmHg · {recordDate(record.recordedAt)}</Text>)}
                      </View>
                    )}
                    {m.type === 'bloodPressure' ? (recordsLoading
                      ? <Text style={{ fontSize: '12px', color: colors.textMuted }}>血压趋势加载中...</Text>
                      : recordsError ? <Text style={{ fontSize: '12px', color: colors.danger }}>{recordsError}</Text>
                      : <View><Text style={{ display: 'block', fontSize: '11px', color: colors.textMuted, marginBottom: '6px' }}>{period === 'month' ? '近30天' : '近7天'}血压趋势</Text><BloodPressureChart records={bpRecords} height={105} /></View>)
                      : points?.length > 1 && <TrendChart points={points} height={70} color={statusColor} />}
                  </View>
                );
              })}
            </View>
          )}

          {!!report.recordCount && (
            <View onClick={() => setShowRecords(value => !value)} style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, boxShadow: shadow.card }}>
              <Text style={{ fontSize: '18px' }}>📋</Text>
              <Text style={{ fontSize: '14px', color: colors.textSecondary }}>本期共记录 <Text style={{ fontSize: '16px', fontWeight: 800, color: colors.primary }}>{report.recordCount}</Text> 条健康数据</Text>
              <Text style={{ marginLeft: 'auto', fontSize: '13px', color: colors.primary }}>{showRecords ? '收起 ▲' : '查看明细 ›'}</Text>
            </View>
          )}

          {showRecords && (
            <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, marginTop: '8px', padding: `0 ${spacing.md}px`, boxShadow: shadow.card }}>
              {recordsLoading ? <Text style={{ display: 'block', padding: '12px 0', fontSize: '12px', color: colors.textMuted }}>加载明细中...</Text>
                : recordsError ? <Text style={{ display: 'block', padding: '12px 0', fontSize: '12px', color: colors.danger }}>{recordsError}</Text>
                : records.length ? records.map((record, index) => (
                <View key={record._id || index} style={{ padding: '12px 0', borderBottom: index < records.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
                  <View style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <Text style={{ fontSize: '13px', color: colors.textPrimary, fontWeight: 600 }}>{record.label}{record.type === 'bloodPressure' ? ` · ${bloodPressureArm(record)}` : ''}</Text>
                    <Text style={{ fontSize: '13px', color: colors.primary, fontWeight: 700 }}>{record.value} {record.unit}</Text>
                  </View>
                  <Text style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: colors.textMuted }}>{recordDate(record.recordedAt)}</Text>
                </View>
              )) : <Text style={{ display: 'block', padding: '12px 0', fontSize: '12px', color: colors.textMuted }}>暂无可查看的记录明细</Text>}
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
    </View>
  );
}
