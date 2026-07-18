import React from 'react';
import { View, Text } from '@tarojs/components';
import { colors, spacing, radius } from '../theme';

// 轻量趋势图组件：用纯 div 柱状条实现，不依赖 canvas / echarts（避免小程序端引入图表库的额外构建风险）。
// 用于首页迷你走势图 + 健康档案趋势图 + 健康报告指标图。
// points: [{ label, value }]；height: 图表高度(px)；color: 柱状条颜色
export default function TrendChart({ points = [], height = 80, color = colors.primary, unit = '', showValues = true, mini = false }) {
  if (!points.length) {
    return (
      <View style={{ height: `${height}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: '12px', color: colors.textMuted }}>暂无数据</Text>
      </View>
    );
  }
  const values = points.map((p) => Number(p.value) || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  return (
    <View>
      <View style={{ display: 'flex', alignItems: 'flex-end', gap: mini ? '3px' : '6px', height: `${height}px`, padding: mini ? '0' : `0 ${spacing.xs}px` }}>
        {points.map((p, i) => {
          const v = Number(p.value) || 0;
          const barH = Math.max(4, ((v - min) / range) * (height - (mini ? 4 : 20)));
          return (
            <View key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              {showValues && !mini && (
                <Text style={{ fontSize: '9px', color: colors.textMuted, marginBottom: '2px' }}>{v}</Text>
              )}
              <View style={{ width: '100%', maxWidth: mini ? '4px' : '14px', height: `${barH}px`, backgroundColor: color, borderRadius: `${radius.xs}px ${radius.xs}px 0 0`, opacity: 0.85 }} />
            </View>
          );
        })}
      </View>
      {!mini && (
        <View style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
          {points.map((p, i) => (
            <Text key={i} style={{ flex: 1, fontSize: '9px', color: colors.textMuted, textAlign: 'center' }} numberOfLines={1}>{p.label}</Text>
          ))}
        </View>
      )}
    </View>
  );
}
