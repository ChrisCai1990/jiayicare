import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { shareAPI } from '../../services/api';

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
        <View style={[styles.trendTag, { backgroundColor: trendColor + '15' }]}>
          <Ionicons name={trendIcon} size={12} color={trendColor} />
          <Text style={[styles.trendTagText, { color: trendColor }]}>{m.delta}</Text>
        </View>
      </View>
    </View>
  );
}

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

export default function PublicReportScreen({ route, navigation }) {
  const token = route?.params?.token;
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!token) { setError('无效的分享链接'); setLoading(false); return; }
    shareAPI.getPublic(token)
      .then(res => {
        if (res.success) setData(res.data);
        else setError(res.message || '链接已失效');
      })
      .catch(() => setError('加载失败，请检查网络'))
      .finally(() => setLoading(false));
  }, [token]);

  const report = data?.reportData;

  // 到期时间格式化
  const expiryText = data?.expiresAt
    ? `链接有效至 ${new Date(data.expiresAt).toLocaleDateString('zh-CN')}`
    : '';

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部访客标记 */}
      <View style={styles.topBar}>
        <View style={styles.guestBadge}>
          <Ionicons name="eye-outline" size={14} color={colors.primary} />
          <Text style={styles.guestText}>健康报告分享 · 访客查看</Text>
        </View>
        <TouchableOpacity style={styles.loginBtn} onPress={() => {
          // 清除 share 参数跳转登录
          if (typeof window !== 'undefined') {
            window.location.href = window.location.origin;
          }
        }}>
          <Text style={styles.loginBtnText}>登录/注册</Text>
        </TouchableOpacity>
      </View>

      {/* 加载中 */}
      {loading && (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>加载报告中…</Text>
        </View>
      )}

      {/* 错误 */}
      {!loading && !!error && (
        <View style={styles.centerWrap}>
          <View style={styles.errorIcon}>
            <Ionicons name="link-outline" size={40} color={colors.textMuted} />
          </View>
          <Text style={styles.errorTitle}>链接已失效</Text>
          <Text style={styles.errorDesc}>{error}</Text>
          <TouchableOpacity style={styles.gotoBtn} onPress={() => {
            if (typeof window !== 'undefined') window.location.href = window.location.origin;
          }}>
            <Text style={styles.gotoBtnText}>前往嘉医汇</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 报告内容 */}
      {!loading && !error && report && (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* 分享人信息 */}
          <View style={styles.sharerCard}>
            <View style={styles.sharerAvatar}>
              <Text style={styles.sharerAvatarText}>
                {(data?.userName || '用').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.sharerInfo}>
              <Text style={styles.sharerName}>{data?.userName || '用户'} 的健康报告</Text>
              <Text style={styles.sharerSub}>{expiryText}</Text>
            </View>
            <View style={styles.sharerBadge}>
              <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
              <Text style={styles.sharerBadgeText}>嘉医汇</Text>
            </View>
          </View>

          {/* 报告头 */}
          <View style={styles.reportHeader}>
            <View style={styles.reportHeaderLeft}>
              <Text style={styles.reportPeriod}>{report.period}</Text>
              <Text style={styles.reportRange}>{report.dateRange}</Text>
              <View style={styles.taskRow}>
                <Ionicons name="checkbox-outline" size={14} color={colors.textMuted} />
                <Text style={styles.taskText}>
                  {report.taskCompletion?.completed}/{report.taskCompletion?.total} 任务完成（{report.taskCompletion?.rate}%）
                </Text>
              </View>
            </View>
            <View style={styles.scoreRingWrap}>
              <View style={[styles.scoreRing, {
                borderColor: report.healthScore >= 80 ? colors.success
                  : report.healthScore >= 60 ? colors.warning : colors.danger
              }]}>
                <Text style={[styles.scoreRingNum, {
                  color: report.healthScore >= 80 ? colors.success
                    : report.healthScore >= 60 ? colors.warning : colors.danger
                }]}>{report.healthScore}</Text>
                <Text style={styles.scoreRingLabel}>分</Text>
              </View>
            </View>
          </View>

          {/* 亮点 */}
          {report.highlights?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>本期亮点</Text>
              <View style={styles.card}>
                {report.highlights.map((h, i) => <HighlightItem key={i} item={h} />)}
              </View>
            </View>
          )}

          {/* 指标 */}
          {report.metrics?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>健康指标</Text>
              <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
                {report.metrics.map((m, i) => (
                  <View key={i}>
                    <MetricRow m={m} />
                    {i < report.metrics.length - 1 && <View style={styles.divider} />}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 记录条数 */}
          <View style={styles.section}>
            <View style={styles.countCard}>
              <Ionicons name="clipboard-outline" size={18} color={colors.primary} />
              <Text style={styles.countText}>
                本期共记录 <Text style={styles.countNum}>{report.recordCount}</Text> 条健康数据
              </Text>
            </View>
          </View>

          {/* CTA */}
          <View style={styles.ctaCard}>
            <Ionicons name="heart-outline" size={28} color={colors.primary} style={{ marginBottom: 8 }} />
            <Text style={styles.ctaTitle}>管理您的健康数据</Text>
            <Text style={styles.ctaDesc}>注册嘉医汇，获得专属医生随访与健康管理服务</Text>
            <TouchableOpacity style={styles.ctaBtn} onPress={() => {
              if (typeof window !== 'undefined') window.location.href = window.location.origin;
            }}>
              <Text style={styles.ctaBtnText}>立即体验</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.white} />
            </TouchableOpacity>
          </View>

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // 顶部
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  guestBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guestText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  loginBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    backgroundColor: colors.primary, borderRadius: radius.full,
  },
  loginBtnText: { fontSize: 13, color: colors.white, fontWeight: '700' },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  loadingText: { fontSize: 14, color: colors.textMuted },
  errorIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  errorTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  errorDesc: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  gotoBtn: {
    paddingHorizontal: spacing.xl, paddingVertical: 11,
    backgroundColor: colors.primary, borderRadius: radius.full, marginTop: spacing.sm,
  },
  gotoBtnText: { fontSize: 14, color: colors.white, fontWeight: '700' },

  // 分享人卡片
  sharerCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, margin: spacing.lg,
    borderRadius: radius.lg, padding: spacing.md, ...shadow.sm,
  },
  sharerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center',
  },
  sharerAvatarText: { fontSize: 18, fontWeight: '800', color: colors.primary },
  sharerInfo: { flex: 1 },
  sharerName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  sharerSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  sharerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.primary + '10', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full,
  },
  sharerBadgeText: { fontSize: 11, color: colors.primary, fontWeight: '600' },

  // 报告头
  reportHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.white, marginHorizontal: spacing.lg,
    borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.sm,
  },
  reportHeaderLeft: { flex: 1, paddingRight: spacing.md },
  reportPeriod: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  reportRange: { fontSize: 12, color: colors.textMuted, marginVertical: 4 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  taskText: { fontSize: 12, color: colors.textSecondary },
  scoreRingWrap: { alignItems: 'center' },
  scoreRing: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreRingNum: { fontSize: 22, fontWeight: '800' },
  scoreRingLabel: { fontSize: 10, color: colors.textMuted },

  section: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, ...shadow.sm },
  highlightItem: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  highlightText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
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

  // CTA
  ctaCard: {
    margin: spacing.lg, marginTop: spacing.xl,
    backgroundColor: colors.primary + '08',
    borderRadius: radius.lg, padding: spacing.xl,
    alignItems: 'center', borderWidth: 1, borderColor: colors.primary + '20',
  },
  ctaTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  ctaDesc: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: 12,
  },
  ctaBtnText: { fontSize: 14, color: colors.white, fontWeight: '700' },
});
