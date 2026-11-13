import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline, Circle, Text as SvgText, Line } from 'react-native-svg';
import { colors, spacing, radius, shadow } from '../../theme';
import { userAPI, recordsAPI } from '../../services/api';
import ShareSheet from '../../components/ShareSheet';

const PERIOD_TABS = ['周报', '月报'];
const TREND_DESCRIPTION = { down: '下降', up: '上升', stable: '基本持平' };
const reportDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未记录' : `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const bloodPressureArm = record => {
  const arm = String(record?.extra?.arm || record?.note || '');
  return /左[臂手]/.test(arm) ? '左臂' : /右[臂手]/.test(arm) ? '右臂' : '未标注';
};
const recordNumber = (record, field) => {
  if (field === 'sys' || field === 'dia') {
    const parts = String(record.value || '').split('/');
    return Number(record.extra?.[field] ?? parts[field === 'sys' ? 0 : 1]);
  }
  return Number(record.value);
};

function ReportCurve({ records, field, color, unit }) {
  const values = records.map(record => ({ value: recordNumber(record, field), recordedAt: record.recordedAt }))
    .filter(point => Number.isFinite(point.value) && point.value > 0).slice(-12);
  if (!values.length) return <Text style={styles.chartEmpty}>暂无曲线记录</Text>;
  const width = Dimensions.get('window').width - spacing.lg * 2 - spacing.md * 2;
  const height = 100;
  const min = Math.min(...values.map(point => point.value));
  const max = Math.max(...values.map(point => point.value));
  const pad = Math.max((max - min) * 0.2, 1);
  const x = index => values.length === 1 ? width / 2 : 25 + index * (width - 50) / (values.length - 1);
  const y = value => 20 + (max + pad - value) * 65 / (max - min + pad * 2);
  return <View>
    <Svg width={width} height={height}>
      {[25, 52, 80].map(lineY => <Line key={lineY} x1={25} y1={lineY} x2={width - 25} y2={lineY} stroke={colors.border} />)}
      {values.length > 1 && <Polyline points={values.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')} fill="none" stroke={color} strokeWidth={2.5} />}
      {values.map((point, index) => <React.Fragment key={`${point.recordedAt}-${index}`}>
        <Circle cx={x(index)} cy={y(point.value)} r={4} fill="#fff" stroke={color} strokeWidth={2} />
        <SvgText x={x(index)} y={Math.max(11, y(point.value) - 9)} fontSize={10} fill={color} textAnchor="middle">{point.value}</SvgText>
      </React.Fragment>)}
    </Svg>
    <View style={styles.chartDates}><Text style={styles.chartDate}>{reportDate(values[0].recordedAt).split(' ')[0]}</Text><Text style={styles.chartDate}>{values.length > 1 ? reportDate(values[values.length - 1].recordedAt).split(' ')[0] : unit}</Text></View>
  </View>;
}

function MetricRow({ m, records, expanded, onToggle, loading, error }) {
  const metricRecords = records.filter(record => record.type === m.type).sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  const bpArms = ['左臂', '右臂', '未标注'].filter(arm => metricRecords.some(record => bloodPressureArm(record) === arm));
  const [arm, setArm] = useState('');
  const activeArm = bpArms.includes(arm) ? arm : bpArms[0];
  const chartRecords = m.type === 'bloodPressure' ? metricRecords.filter(record => bloodPressureArm(record) === activeArm) : metricRecords;
  const description = m.type === 'bloodPressure' ? '查看分侧趋势' : metricRecords.length > 1 ? (TREND_DESCRIPTION[m.trend] || '查看变化趋势') : '已有记录';
  return (
    <View>
      <TouchableOpacity style={styles.metricRow} onPress={onToggle} accessibilityRole="button" accessibilityLabel={`${m.label}${expanded ? '收起' : '查看曲线'}`}>
        <Text style={styles.metricLabel}>{m.label}</Text>
        <View style={styles.metricRight}><Text style={styles.metricDescription}>{description}</Text><Text style={styles.metricAction}>{expanded ? '收起 ▲' : '查看曲线 ›'}</Text></View>
      </TouchableOpacity>
      {expanded && <View style={styles.metricChart}>
        {loading ? <ActivityIndicator color={colors.primary} /> : error ? <Text style={styles.chartEmpty}>{error}</Text> : m.type === 'bloodPressure' ? <>
          <View style={styles.armTabs}>{bpArms.map(item => <TouchableOpacity key={item} onPress={() => setArm(item)} style={[styles.armTab, item === activeArm && styles.armTabActive]}><Text style={item === activeArm ? styles.armTabTextActive : styles.armTabText}>{item}</Text></TouchableOpacity>)}</View>
          <Text style={styles.chartTitle}>收缩压（mmHg）</Text><ReportCurve records={chartRecords} field="sys" color={colors.primary} />
          <Text style={styles.chartTitle}>舒张压（mmHg）</Text><ReportCurve records={chartRecords} field="dia" color={colors.primary} />
        </> : <ReportCurve records={chartRecords} color={colors.primary} unit={m.unit} />}
      </View>}
    </View>
  );
}

function TaskProgress({ total, completed, rate }) {
  return (
    <View style={styles.taskProgressWrap}>
      <View style={styles.taskProgressBar}>
        <View style={[styles.taskProgressFill, { width: `${rate}%`, backgroundColor: rate >= 80 ? colors.success : rate >= 60 ? colors.warning : colors.danger }]} />
      </View>
      <Text style={styles.taskProgressText}>{completed}/{total} 任务完成（{rate}%）</Text>
    </View>
  );
}

function EmptyReport({ tab }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <Ionicons name="bar-chart-outline" size={44} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>暂无{tab === '周报' ? '本周' : '本月'}数据</Text>
      <Text style={styles.emptyDesc}>记录健康数据后，这里会自动生成{tab === '周报' ? '周' : '月'}度报告</Text>
    </View>
  );
}

export default function HealthReportScreen({ navigation }) {
  const [tab, setTab]         = useState('周报');
  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [expandedMetric, setExpandedMetric] = useState('');
  const [showRecords, setShowRecords] = useState(false);
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState('');

  const loadReport = useCallback(async (period) => {
    setLoading(true);
    setError(null);
    setReport(null);
    setExpandedMetric('');
    setShowRecords(false);
    try {
      const res = await userAPI.getReport(period);
      if (res.success) setReport(res.data);
      else setError(res.message || '获取报告失败');
    } catch (err) {
      setError(err.message || '网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport(tab === '周报' ? 'week' : 'month');
  }, [tab, loadReport]);

  useEffect(() => {
    if (!report) return;
    let active = true;
    setRecords([]);
    setRecordsError('');
    setRecordsLoading(true);
    (async () => {
      const all = [];
      for (let page = 1; page <= 20; page += 1) {
        const result = await recordsAPI.list({ days: tab === '月报' ? 30 : 7, limit: 100, page });
        if (!result.success || !Array.isArray(result.data)) throw new Error('记录加载失败');
        all.push(...result.data);
        if (result.data.length < 100) break;
      }
      if (active) setRecords(all);
    })().catch(() => { if (active) setRecordsError('记录加载失败，请稍后重试'); }).finally(() => { if (active) setRecordsLoading(false); });
    return () => { active = false; };
  }, [report, tab]);

  const isEmpty = !loading && !error && report && report.recordCount === 0;
  const currentPeriod = tab === '周报' ? 'week' : 'month';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>健康记录汇总</Text>
        <TouchableOpacity
          style={styles.shareIconBtn}
          onPress={() => setShowShare(true)}
          disabled={!report || loading}
        >
          <Ionicons name="share-social-outline" size={22} color={report && !loading ? colors.primary : colors.textDisabled} />
        </TouchableOpacity>
      </View>

      {/* Period Tabs */}
      <View style={styles.tabsWrap}>
        {PERIOD_TABS.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Loading */}
      {loading && (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>加载报告中…</Text>
        </View>
      )}

      {/* Error */}
      {!loading && error && (
        <View style={styles.centerWrap}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>加载失败</Text>
          <Text style={styles.emptyDesc}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadReport(tab === '周报' ? 'week' : 'month')}>
            <Text style={styles.retryText}>重新加载</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Empty */}
      {isEmpty && <EmptyReport tab={tab} />}

      {/* Report Content */}
      {!loading && !error && report && !isEmpty && (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Report Header */}
          <View style={styles.reportHeader}>
            <View style={styles.reportHeaderLeft}>
              <Text style={styles.reportPeriod}>{report.period}</Text>
              <Text style={styles.reportRange}>{report.dateRange}</Text>
              <TaskProgress
                total={report.taskCompletion.total}
                completed={report.taskCompletion.completed}
                rate={report.taskCompletion.rate}
              />
            </View>
          </View>

          {/* Metrics */}
          {report.metrics && report.metrics.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>健康指标汇总</Text>
              <View style={styles.metricsCard}>
                {report.metrics.map((m, i) => (
                  <View key={i}>
                    <MetricRow m={m} records={records} loading={recordsLoading} error={recordsError} expanded={expandedMetric === m.type} onToggle={() => setExpandedMetric(current => current === m.type ? '' : m.type)} />
                    {i < report.metrics.length - 1 && <View style={styles.divider} />}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Record Count */}
          <View style={styles.section}>
            <TouchableOpacity style={styles.countCard} onPress={() => setShowRecords(value => !value)}>
              <Ionicons name="clipboard-outline" size={20} color={colors.primary} />
              <Text style={styles.countText}>本期共记录 <Text style={styles.countNum}>{report.recordCount}</Text> 条健康数据</Text>
              <Text style={styles.metricAction}>{showRecords ? '收起 ▲' : '查看明细 ›'}</Text>
            </TouchableOpacity>
            {showRecords && <View style={styles.recordList}>{recordsLoading ? <ActivityIndicator color={colors.primary} /> : recordsError ? <Text style={styles.chartEmpty}>{recordsError}</Text> : records.length ? records.map((record, index) => <View key={record._id || index} style={styles.recordRow}><View style={styles.recordHead}><Text style={styles.metricLabel}>{record.label || record.type}{record.type === 'bloodPressure' ? ` · ${bloodPressureArm(record)}` : ''}</Text><Text style={styles.recordValue}>{record.value} {record.unit}</Text></View><Text style={styles.chartDate}>{reportDate(record.recordedAt)}</Text></View>) : <Text style={styles.chartEmpty}>暂无可查看的记录明细</Text>}</View>}
          </View>

          {/* Share Button */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={() => setShowShare(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="share-social-outline" size={18} color={colors.white} />
              <Text style={styles.shareBtnText}>分享报告</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      )}

      {/* 分享面板 */}
      <ShareSheet
        visible={showShare}
        onClose={() => setShowShare(false)}
        report={report}
        period={currentPeriod}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: 4 },
  shareIconBtn: { padding: 4, width: 32, alignItems: 'center' },
  pageTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  toastBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.textPrimary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
  },
  toastText: { color: colors.white, fontSize: 13, fontWeight: '500' },
  tabsWrap: {
    flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.border + '50', borderRadius: radius.md, padding: 4,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  tabBtnActive: { backgroundColor: colors.white, ...shadow.sm },
  tabBtnText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  tabBtnTextActive: { color: colors.primary, fontWeight: '700' },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  loadingText: { fontSize: 14, color: colors.textMuted, marginTop: spacing.sm },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl * 2 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  emptyDesc: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl, paddingVertical: 10,
    backgroundColor: colors.primary, borderRadius: radius.full,
  },
  retryText: { fontSize: 14, color: colors.white, fontWeight: '600' },

  reportHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.white, marginHorizontal: spacing.lg, marginTop: spacing.md,
    borderRadius: radius.lg, padding: spacing.lg, ...shadow.sm,
  },
  reportHeaderLeft: { flex: 1, paddingRight: spacing.md },
  reportPeriod: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  reportRange: { fontSize: 12, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
  taskProgressWrap: { marginTop: spacing.xs },
  taskProgressBar: { height: 6, backgroundColor: colors.border, borderRadius: 3, marginBottom: 6 },
  taskProgressFill: { height: 6, borderRadius: 3 },
  taskProgressText: { fontSize: 11, color: colors.textSecondary },
  scoreRingWrap: { alignItems: 'center', gap: spacing.xs },
  scoreRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 5, alignItems: 'center', justifyContent: 'center' },
  scoreRingNum: { fontSize: 22, fontWeight: '800' },
  scoreRingLabel: { fontSize: 10, color: colors.textMuted },
  deltaBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  deltaText: { fontSize: 12, fontWeight: '700' },

  section: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  highlightCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, ...shadow.sm },
  highlightItem: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  highlightText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  metricsCard: { backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden', ...shadow.sm },
  metricRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  metricLabel: { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  metricRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metricDescription: { fontSize: 12, color: colors.textSecondary },
  metricAction: { fontSize: 12, color: colors.primary },
  metricChart: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  chartTitle: { fontSize: 12, color: colors.textSecondary, marginTop: 10, marginBottom: 4 },
  chartEmpty: { fontSize: 12, color: colors.textMuted, paddingVertical: 14 },
  chartDates: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  chartDate: { fontSize: 11, color: colors.textMuted },
  armTabs: { flexDirection: 'row', gap: 8, marginTop: 6 },
  armTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.background },
  armTabActive: { backgroundColor: colors.primary },
  armTabText: { fontSize: 12, color: colors.textSecondary },
  armTabTextActive: { fontSize: 12, color: colors.white },
  metricValue: { fontSize: 18, fontWeight: '800' },
  metricUnit: { fontSize: 11, color: colors.textMuted, marginRight: 4 },
  trendTag: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.full },
  trendTagText: { fontSize: 11, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },

  countCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, ...shadow.sm,
  },
  countText: { fontSize: 14, color: colors.textSecondary },
  countNum: { fontSize: 16, fontWeight: '800', color: colors.primary },
  recordList: { backgroundColor: colors.white, marginTop: 8, paddingHorizontal: spacing.md, borderRadius: radius.md },
  recordRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  recordHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  recordValue: { fontSize: 13, color: colors.primary, fontWeight: '700' },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 14, ...shadow.sm,
  },
  shareBtnText: { fontSize: 15, color: colors.white, fontWeight: '700' },
});
