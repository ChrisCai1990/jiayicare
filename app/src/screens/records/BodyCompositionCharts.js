import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { colors, spacing, radius } from '../../theme';

export const BODY_COMPOSITION_METRICS = [
  { key: 'weight', referenceKey: 'weightReference', label: '体成分体重', unit: ' kg', color: '#2563EB' },
  { key: 'skelMuscle', referenceKey: 'skelMuscleReference', label: '骨骼肌', unit: ' kg', color: '#1E6B50' },
  { key: 'bodyFatRate', referenceKey: 'bodyFatRateReference', label: '体脂率', unit: '%', color: '#D97706' },
  { key: 'visceralFat', referenceKey: 'visceralFatReference', label: '内脏脂肪', unit: ' 级', color: '#7C3AED' },
];

const numberOf = value => Number(String(value ?? '').match(/-?\d+(?:\.\d+)?/)?.[0]);
const dateOf = row => String(row?.measuredAt || row?.checkDate || row?.recordedAt || '').slice(0, 10);

function MetricChart({ history, current, metric }) {
  const historyRows = (history || []).filter(row => row && Number.isFinite(numberOf(row[metric.key])));
  const currentHasValue = current && Number.isFinite(numberOf(current[metric.key]));
  const currentDate = dateOf(current);
  const currentIsInHistory = currentHasValue && historyRows.some(row => (
    (current?.sourceReportId && String(row?.sourceReportId || '') === String(current.sourceReportId))
    || (dateOf(row) === currentDate && numberOf(row[metric.key]) === numberOf(current[metric.key]))
  ));
  const rows = [...historyRows, ...(currentHasValue && !currentIsInHistory ? [current] : [])]
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  if (!rows.length) return null;

  const valid = rows.map(row => ({ row, value: numberOf(row[metric.key]), date: dateOf(row) }));
  const latest = valid[valid.length - 1];
  const latestWithReference = [...valid].reverse().find(item => item.row?.[metric.referenceKey]) || latest;
  const referenceText = latestWithReference.row?.[metric.referenceKey] || '';
  const referenceValues = String(referenceText).match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  const refLow = referenceValues.length >= 2 ? referenceValues[0] : undefined;
  const refHigh = referenceValues.length >= 2 ? referenceValues[1] : undefined;
  const domainValues = [...valid.map(item => item.value), refLow, refHigh].filter(Number.isFinite);
  const rawMin = Math.min(...domainValues);
  const rawMax = Math.max(...domainValues);
  const paddingY = Math.max((rawMax - rawMin) * 0.18, 0.8);
  const min = rawMin - paddingY;
  const range = Math.max(rawMax + paddingY - min, 1);
  const width = Math.max(320, valid.length * 58);
  const height = 178;
  const padX = 30;
  const padTop = 28;
  const padBottom = 38;
  const point = (value, index) => ({
    x: valid.length === 1 ? width / 2 : padX + index * ((width - padX * 2) / (valid.length - 1)),
    y: height - padBottom - ((value - min) / range) * (height - padTop - padBottom),
  });
  const referenceY = value => height - padBottom - ((value - min) / range) * (height - padTop - padBottom);
  const points = valid.map((item, index) => { const xy = point(item.value, index); return `${xy.x},${xy.y}`; }).join(' ');
  const sourceLabel = latest.row?.source === 'medical_report' || latest.row?.sourceReportId
    ? `体检报告${latest.row?.institution ? ` · ${latest.row.institution}` : ''}`
    : latest.row?.source === 'manual' ? '医护端录入' : '历史档案';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{metric.label}</Text>
        <Text style={[styles.value, { color: metric.color }]}>{latest.value}{metric.unit}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={valid.length > 5} contentContainerStyle={styles.chartScroll}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {[0, 1, 2].map(i => <Line key={i} x1={padX} y1={padTop + i * ((height - padTop - padBottom) / 2)} x2={width - padX} y2={padTop + i * ((height - padTop - padBottom) / 2)} stroke="#E8E5DF" strokeWidth="1" />)}
          {Number.isFinite(refHigh) && <>
            <Line x1={padX} y1={referenceY(refHigh)} x2={width - padX} y2={referenceY(refHigh)} stroke="#E9A6A6" strokeWidth="1.2" strokeDasharray="5 4" />
            <SvgText x={padX + 2} y={referenceY(refHigh) - 4} fontSize="9" fill="#C96D6D">上限 {refHigh}</SvgText>
          </>}
          {Number.isFinite(refLow) && <>
            <Line x1={padX} y1={referenceY(refLow)} x2={width - padX} y2={referenceY(refLow)} stroke="#8EC9DF" strokeWidth="1.2" strokeDasharray="5 4" />
            <SvgText x={padX + 2} y={referenceY(refLow) - 4} fontSize="9" fill="#5DA7C1">下限 {refLow}</SvgText>
          </>}
          {valid.length > 1 && <Polyline points={points} fill="none" stroke={metric.color} strokeWidth="2.5" />}
          {valid.map((item, index) => {
            const xy = point(item.value, index);
            return <React.Fragment key={`${item.date}-${index}`}>
              <Circle cx={xy.x} cy={xy.y} r="4" fill={metric.color} />
              <SvgText x={xy.x} y={xy.y - 9} textAnchor="middle" fontSize="9" fontWeight="600" fill={metric.color}>{item.value}</SvgText>
              <SvgText x={xy.x} y={height - 12} textAnchor="middle" fontSize="8.5" fill="#789287">{item.date ? item.date.slice(5) : '时间未标注'}</SvgText>
            </React.Fragment>;
          })}
        </Svg>
      </ScrollView>
      <View style={styles.meta}>
        <Text style={styles.metaText}>最新检测：{latest.date || '未标注'}</Text>
        <Text style={styles.metaText}>参考范围：{referenceText || '未录入'}</Text>
        <Text style={styles.metaText}>数据来源：{sourceLabel}</Text>
      </View>
    </View>
  );
}

export default function BodyCompositionCharts({ history = [], current = {} }) {
  const hasData = BODY_COMPOSITION_METRICS.some(metric => (
    history.some(row => Number.isFinite(numberOf(row?.[metric.key])))
    || Number.isFinite(numberOf(current?.[metric.key]))
  ));
  if (!hasData) return <Text style={styles.empty}>暂无身体成分数据</Text>;
  return BODY_COMPOSITION_METRICS.map(metric => (
    <MetricChart key={metric.key} history={history} current={current} metric={metric} />
  ));
}

const styles = StyleSheet.create({
  card: { padding: spacing.sm, borderRadius: radius.sm, backgroundColor: '#FAF9F6', marginBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  title: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  value: { fontSize: 17, fontWeight: '800' },
  chartScroll: { minWidth: '100%' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: spacing.xs, paddingTop: 4 },
  metaText: { fontSize: 11, color: colors.textSecondary },
  empty: { paddingVertical: 24, textAlign: 'center', fontSize: 13, color: colors.textMuted },
});
