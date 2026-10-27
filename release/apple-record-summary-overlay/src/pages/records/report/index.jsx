import React, { useState, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { userAPI, recordsAPI } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

// 对齐 app/src/screens/records/HealthReportScreen.js 的核心信息：周期评分+指标趋势图化展示+任务完成率+亮点。
const TREND_ICON = { down: '↓', up: '↑', stable: '–' };

export default function HealthReportPage() {
  const { statusBarHeight } = useNavBar();
  const [period, setPeriod] = useState('week');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    userAPI.getReport(period).then((res) => {
      if (active && res.success) setReport(res.data);
    }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period]);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState([]);
  const [detailPage, setDetailPage] = useState(0);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const detailRequest = React.useRef(0);
  useEffect(() => { detailRequest.current++; setDetailsOpen(false); setDetails([]); setDetailPage(0); setDetailTotal(0); setDetailLoading(false); setDetailError(''); }, [period]);
  const loadDetails = async (page = 1) => {
    const request = ++detailRequest.current;
    setDetailsOpen(true); setDetailLoading(true); setDetailError('');
    try {
      const res = await recordsAPI.list({ days: period === 'month' ? 30 : 7, page, limit: 50 });
      if (request !== detailRequest.current) return;
      if (!res.success || !Array.isArray(res.data)) throw new Error('记录未能加载');
      setDetails(old => page === 1 ? res.data : [...old, ...res.data]);
      setDetailTotal(res.total); setDetailPage(page);
    } catch (e) { if (request === detailRequest.current) setDetailError(e.message || '记录未能加载'); }
    finally { if (request === detailRequest.current) setDetailLoading(false); }
  };
  const labels = { weight: '体重', bloodPressure: '血压', bloodSugar: '血糖', heartRate: '心率', sleep: '睡眠', diet: '饮食', exercise: '运动', water: '饮水', bowel: '排便', smoking: '吸烟', alcohol: '饮酒', mood: '心情' };


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
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>健康记录汇总</Text>
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
              <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{report.periodLabel || (period === 'month' ? '本月记录汇总' : '本周记录汇总')}</Text>
              <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', margin: '4px 0' }}>{report.dateRange}</Text>
              {!!report.taskCompletion && (
                <Text style={{ fontSize: '12px', color: colors.textSecondary }}>☑ {report.taskCompletion.completed}/{report.taskCompletion.total} 任务完成（{report.taskCompletion.rate}%）</Text>
              )}
            </View>
          </View>

          <Text style={{ display: 'block', color: colors.textSecondary, fontSize: '12px', lineHeight: '20px', marginBottom: '12px' }}>本页汇总已记录的数据；数值升降不代表健康状况改善或恶化。</Text>

          {report.metrics?.length > 0 && (
            <View style={{ marginBottom: `${spacing.md}px` }}>
              <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>本期指标摘要</Text>
              {report.metrics.map((m, i) => {
                const statusColor = colors.textPrimary;
                const trendColor = colors.textSecondary;
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

                  </View>
                );
              })}
            </View>
          )}

          {!!report.recordCount && (
            <View onClick={() => detailsOpen ? setDetailsOpen(false) : loadDetails()} style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, boxShadow: shadow.card }}>
              <Text style={{ fontSize: '18px' }}>📋</Text>
              <Text style={{ fontSize: '14px', color: colors.textSecondary }}>本期共记录 <Text style={{ fontSize: '16px', fontWeight: 800, color: colors.primary }}>{report.recordCount}</Text> 条健康数据 · {detailsOpen ? '收起' : '查看明细 ›'}</Text>
            </View>
          )}

          {detailsOpen && <View style={{ backgroundColor: '#fff', padding: '16px', marginTop: '8px', borderRadius: '12px' }}>
            {details.map(row => <View key={row._id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
              <Text style={{ display: 'block', color: colors.textPrimary }}>{labels[row.type] || row.type}：{row.extra?.sys ? `${row.extra.sys}/${row.extra.dia}` : row.value} {row.unit || ''}</Text>
              <Text style={{ display: 'block', color: colors.textSecondary, fontSize: '12px' }}>{new Date(row.recordedAt).toLocaleString('zh-CN')}</Text>
              {!!row.note && <Text style={{ color: colors.textSecondary }}>{row.note}</Text>}
            </View>)}
            {detailLoading && <Text>正在读取…</Text>}
            {!!detailError && <Text onClick={() => loadDetails(detailPage + 1)} style={{ color: colors.danger }}>{detailError} · 点击重试</Text>}
            {!detailLoading && !detailError && details.length < detailTotal && <Text onClick={() => loadDetails(detailPage + 1)} style={{ color: colors.primary }}>加载更多</Text>}
          </View>}

        </>
      )}
      </View>
    </View>
  );
}
