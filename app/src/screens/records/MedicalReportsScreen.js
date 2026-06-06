import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { reportsAPI } from '../../services/api';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - 40;
const CHART_H = 80;

const CATEGORY_META = {
  tumor:          { label: '常见肿瘤筛查',  icon: 'scan-circle-outline',   color: '#DC3545' },
  cardiovascular: { label: '心血管筛查',    icon: 'heart-outline',         color: '#E91E63' },
  brain_vessel:   { label: '脑血管病筛查',  icon: 'pulse-outline',         color: '#7C3AED' },
  chronic:        { label: '慢性病筛查',    icon: 'medkit-outline',        color: '#D97706' },
  other_routine:  { label: '其他常规筛查',  icon: 'document-text-outline', color: '#0077B6' },
  health_promote: { label: '健康促进筛查',  icon: 'leaf-outline',          color: '#1E6B50' },
};
const ITEM_STATUS_COLOR = { normal: colors.success, abnormal: colors.danger, attention: colors.warning, unknown: colors.textMuted };
const ITEM_STATUS_LABEL = { normal: '正常', abnormal: '异常', attention: '关注', unknown: '未知' };

// 简单 SVG 折线图（纯 RN View，支持 Web）
function MiniLineChart({ points = [], color = colors.primary, label }) {
  if (points.length < 2) return null;
  const vals = points.map(p => parseFloat(p.value)).filter(v => !isNaN(v));
  if (vals.length < 2) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pw = CHART_W / (vals.length - 1);

  const dots = vals.map((v, i) => ({
    x: i * pw,
    y: CHART_H - ((v - min) / range) * (CHART_H - 16) - 8,
    v,
  }));

  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>{label} 趋势</Text>
      <View style={{ width: CHART_W, height: CHART_H, backgroundColor: colors.background, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
        {/* 折线用多段 View 模拟 */}
        {dots.slice(0, -1).map((d, i) => {
          const next = dots[i + 1];
          const dx = next.x - d.x;
          const dy = next.y - d.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * 180 / Math.PI;
          return (
            <View key={i} style={{
              position: 'absolute', left: d.x, top: d.y,
              width: len, height: 2, backgroundColor: color,
              transformOrigin: '0 50%',
              transform: [{ rotate: `${angle}deg` }],
            }} />
          );
        })}
        {/* 数据点 */}
        {dots.map((d, i) => (
          <View key={i} style={{
            position: 'absolute', left: d.x - 4, top: d.y - 4,
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: color, borderWidth: 1.5, borderColor: '#fff',
          }}>
            {i === dots.length - 1 && (
              <Text style={{ position: 'absolute', top: -18, left: -12, fontSize: 10, color, fontWeight: '700', width: 36, textAlign: 'center' }}>
                {d.v}
              </Text>
            )}
          </View>
        ))}
        {/* 最早 & 最近日期 */}
        {points.length >= 2 && (
          <>
            <Text style={{ position: 'absolute', bottom: 2, left: 0, fontSize: 9, color: colors.textMuted }}>{points[0].date || ''}</Text>
            <Text style={{ position: 'absolute', bottom: 2, right: 0, fontSize: 9, color: colors.textMuted }}>{points[points.length - 1].date || ''}</Text>
          </>
        )}
      </View>
    </View>
  );
}

function ReportItemRow({ item }) {
  const statusColor = ITEM_STATUS_COLOR[item.status] || colors.textMuted;
  return (
    <View style={styles.itemRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{item.name}</Text>
        {item.referenceRange ? <Text style={styles.itemRef}>参考范围：{item.referenceRange}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.itemValue, { color: statusColor }]}>{item.value}{item.unit ? ` ${item.unit}` : ''}</Text>
        <Text style={[styles.itemStatus, { color: statusColor }]}>{ITEM_STATUS_LABEL[item.status] || ''}</Text>
      </View>
    </View>
  );
}

function ReportCard({ report, onParseAI, parsing }) {
  const [expanded, setExpanded] = useState(false);
  const hasItems = report.reportItems?.length > 0;
  const hasAI = !!report.aiSummary;

  return (
    <View style={styles.reportCard}>
      <TouchableOpacity style={styles.reportCardHeader} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
        <View style={{ flex: 1 }}>
          <Text style={styles.reportTitle}>{report.title}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            {report.checkDate || report.date
              ? <Text style={styles.reportMeta}><Ionicons name="calendar-outline" size={11} color={colors.textMuted} /> {report.checkDate || report.date}</Text>
              : null}
            {(report.institution || report.hospital)
              ? <Text style={styles.reportMeta}><Ionicons name="business-outline" size={11} color={colors.textMuted} /> {report.institution || report.hospital}</Text>
              : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {report.aiStatus === 'pending' && <View style={styles.aiPendingBadge}><Text style={styles.aiPendingText}>待审核</Text></View>}
          {report.aiStatus === 'reviewed' && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.reportCardBody}>
          {hasAI && (
            <View style={styles.aiSummaryBox}>
              <Text style={styles.aiSummaryTitle}>AI 趋势分析{report.aiStatus === 'reviewed' ? '（已审核）' : '（待审核）'}</Text>
              <Text style={styles.aiSummaryText}>{report.aiSummary}</Text>
            </View>
          )}
          {hasItems ? (
            <View>
              <Text style={styles.itemsSectionLabel}>检查项目（{report.reportItems.length} 项）</Text>
              {report.reportItems.map((item, i) => <ReportItemRow key={i} item={item} />)}
            </View>
          ) : (
            <View style={styles.noItemsWrap}>
              <Text style={styles.noItemsText}>暂无解析数据</Text>
              {report.content && (
                <TouchableOpacity style={styles.parseBtn} onPress={() => onParseAI(report._id)} disabled={parsing === report._id}>
                  {parsing === report._id
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <>
                        <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
                        <Text style={styles.parseBtnText}>AI 智能解析</Text>
                      </>
                  }
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function MedicalReportsScreen({ navigation }) {
  const [years, setYears]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [parsing, setParsing]   = useState(null);
  const [selYear, setSelYear]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportsAPI.byCategory();
      setYears(res.data || []);
      if (res.data?.length > 0) setSelYear(res.data[0].year);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleParseAI = async (id) => {
    setParsing(id);
    try {
      await reportsAPI.parseAI(id);
      load();
    } catch (e) {
      alert('AI 解析失败：' + (e.message || '未知错误'));
    } finally { setParsing(null); }
  };

  const currentYear = years.find(y => y.year === selYear);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>体检报告</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : years.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="document-text-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>暂无体检报告</Text>
          <Text style={styles.emptyDesc}>上传报告后，将按年度和类目自动归类展示</Text>
        </View>
      ) : (
        <>
          {/* 年份 Tab */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearTab} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
            {years.map(y => (
              <TouchableOpacity key={y.year}
                style={[styles.yearChip, selYear === y.year && styles.yearChipActive]}
                onPress={() => setSelYear(y.year)}>
                <Text style={[styles.yearChipText, selYear === y.year && styles.yearChipTextActive]}>{y.year} 年</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
            {currentYear?.categories.map(cat => {
              const meta = CATEGORY_META[cat.key] || { label: cat.label, icon: 'document-outline', color: colors.primary };

              // 收集数据类指标用于曲线图
              const dataItems = {};
              cat.reports.forEach(r => {
                (r.reportItems || []).filter(i => i.itemType === 'data' || i.itemType === 'lab').forEach(item => {
                  if (!isNaN(parseFloat(item.value))) {
                    if (!dataItems[item.name]) dataItems[item.name] = [];
                    dataItems[item.name].push({ value: item.value, date: r.checkDate || r.date || '' });
                  }
                });
              });

              return (
                <View key={cat.key} style={styles.categorySection}>
                  <View style={styles.categoryHeader}>
                    <View style={[styles.categoryIconWrap, { backgroundColor: meta.color + '18' }]}>
                      <Ionicons name={meta.icon} size={20} color={meta.color} />
                    </View>
                    <Text style={[styles.categoryTitle, { color: meta.color }]}>{meta.label}</Text>
                    <Text style={styles.categoryCount}>{cat.reports.length} 份</Text>
                  </View>

                  {/* 数据趋势曲线 */}
                  {Object.entries(dataItems)
                    .filter(([, pts]) => pts.length >= 2)
                    .map(([name, pts]) => (
                      <MiniLineChart key={name} label={name} points={pts} color={meta.color} />
                    ))
                  }

                  {cat.reports.map(r => (
                    <ReportCard key={r._id} report={r} onParseAI={handleParseAI} parsing={parsing} />
                  ))}
                </View>
              );
            })}
            <View style={{ height: spacing.xl * 2 }} />
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: colors.textPrimary },

  yearTab:      { maxHeight: 52, paddingVertical: spacing.sm },
  yearChip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.full,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white,
  },
  yearChipActive:     { borderColor: colors.primary, backgroundColor: colors.primary },
  yearChipText:       { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  yearChipTextActive: { color: '#fff' },

  categorySection: { marginBottom: spacing.lg },
  categoryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm,
  },
  categoryIconWrap: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  categoryTitle:   { fontSize: 14, fontWeight: '700', flex: 1 },
  categoryCount:   { fontSize: 12, color: colors.textMuted },

  reportCard: {
    backgroundColor: colors.white, borderRadius: radius.md, marginBottom: spacing.sm,
    ...shadow.xs, overflow: 'hidden',
  },
  reportCardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', padding: spacing.md, gap: spacing.sm,
  },
  reportTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  reportMeta:  { fontSize: 11, color: colors.textMuted },
  aiPendingBadge: { backgroundColor: '#FEF3E2', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  aiPendingText:  { fontSize: 10, color: colors.warning, fontWeight: '700' },

  reportCardBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: spacing.sm },

  aiSummaryBox:  { backgroundColor: '#E8F5EF', borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm },
  aiSummaryTitle:{ fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  aiSummaryText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },

  itemsSectionLabel: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.xs },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  itemName:  { fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  itemRef:   { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  itemValue: { fontSize: 13, fontWeight: '700' },
  itemStatus:{ fontSize: 10, marginTop: 1 },

  noItemsWrap:    { alignItems: 'center', paddingVertical: spacing.md, gap: spacing.sm },
  noItemsText:    { fontSize: 12, color: colors.textMuted },
  parseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary + '12', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary + '30',
  },
  parseBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  emptyDesc:  { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
