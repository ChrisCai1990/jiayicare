import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { userAPI } from '../../services/api';
import ShareSheet from '../../components/ShareSheet';

const PERIOD_TABS = ['周报', '月报'];

function HighlightItem({ item }) {
  const config = {
    good:    { icon: 'checkmark-circle', color: colors.success },
    warning: { icon: 'warning',          color: colors.warning },
    danger:  { icon: 'alert-circle',     color: colors.danger  },
  };
  const c = config[item.type] || config.good;
  return (
    <View style={styles.highlightItem}>
      <Ionicons name={c.icon} size={16} color={c.color} style={{ marginTop: 1 }} />
      <Text style={styles.highlightText}>{item.text}</Text>
    </View>
  );
}

function MetricRow({ m }) {
  const statusColor = m.status === 'normal' ? colors.success : m.status === 'warning' ? colors.warning : colors.danger;
  const trendIcon = m.trend === 'down' ? 'trending-down' : m.trend === 'up' ? 'trending-up' : 'remove';
  const trendColor = m.trend === 'down' ? colors.success : m.trend === 'up' ? colors.warning : colors.textMuted;
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{m.label}</Text>
      <View style={styles.metricRight}>
        <Text style={[styles.metricValue, { color: statusColor }]}>{m.value}</Text>
        <Text style={styles.metricUnit}>{m.unit}</Text>
        <View style={[styles.trendTag, { backgroundColor: trendColor + '12' }]}>
          <Ionicons name={trendIcon} size={12} color={trendColor} />
          <Text style={[styles.trendTagText, { color: trendColor }]}>{m.delta}</Text>
        </View>
      </View>
    </View>
  );
}

function ScoreRing({ score, delta }) {
  const color = score >= 80 ? colors.success : score >= 60 ? colors.warning : colors.danger;
  return (
    <View style={styles.scoreRingWrap}>
      <View style={[styles.scoreRing, { borderColor: color }]}>
        <Text style={[styles.scoreRingNum, { color }]}>{score}</Text>
        <Text style={styles.scoreRingLabel}>分</Text>
      </View>
      {delta != null && (
        <View style={[styles.deltaBadge, { backgroundColor: delta >= 0 ? colors.success + '15' : colors.danger + '15' }]}>
          <Ionicons name={delta >= 0 ? 'trending-up' : 'trending-down'} size={12} color={delta >= 0 ? colors.success : colors.danger} />
          <Text style={[styles.deltaText, { color: delta >= 0 ? colors.success : colors.danger }]}>
            {delta >= 0 ? '+' : ''}{delta}
          </Text>
        </View>
      )}
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

  const loadReport = useCallback(async (period) => {
    setLoading(true);
    setError(null);
    setReport(null);
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

  const isEmpty = !loading && !error && report && report.recordCount === 0;
  const currentPeriod = tab === '周报' ? 'week' : 'month';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>健康报告</Text>
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
            <ScoreRing score={report.healthScore} delta={report.scoreDelta} />
          </View>

          {/* Highlights */}
          {report.highlights && report.highlights.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>本期亮点</Text>
              <View style={styles.highlightCard}>
                {report.highlights.map((h, i) => <HighlightItem key={i} item={h} />)}
              </View>
            </View>
          )}

          {/* Metrics */}
          {report.metrics && report.metrics.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>健康指标汇总</Text>
              <View style={styles.metricsCard}>
                {report.metrics.map((m, i) => (
                  <View key={i}>
                    <MetricRow m={m} />
                    {i < report.metrics.length - 1 && <View style={styles.divider} />}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Record Count */}
          <View style={styles.section}>
            <View style={styles.countCard}>
              <Ionicons name="clipboard-outline" size={20} color={colors.primary} />
              <Text style={styles.countText}>本期共记录 <Text style={styles.countNum}>{report.recordCount}</Text> 条健康数据</Text>
            </View>
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

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 14, ...shadow.sm,
  },
  shareBtnText: { fontSize: 15, color: colors.white, fontWeight: '700' },
});
