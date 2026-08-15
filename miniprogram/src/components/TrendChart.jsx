import React, { useEffect, useRef } from 'react';
import { View, Text, Canvas } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors } from '../theme';

let chartSeed = 0;
export default function TrendChart({ points = [], height = 80, color = colors.primary, unit = '', showValues = true, mini = false }) {
  const canvasId = useRef(`trend-line-${chartSeed += 1}`).current;
  useEffect(() => {
    if (!points.length) return;
    const ctx = Taro.createCanvasContext(canvasId);
    const width = 300;
    const top = showValues && !mini ? 17 : 5;
    const bottom = 7;
    const values = points.map((p) => Number(p.value) || 0);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const padding = Math.max((max - min) * 0.15, 1);
    const low = min - padding;
    const high = max + padding;
    const xAt = (index) => points.length === 1 ? width / 2 : 10 + index * ((width - 20) / (points.length - 1));
    const yAt = (value) => top + ((high - value) / (high - low || 1)) * (height - top - bottom);
    ctx.setLineWidth(mini ? 1.5 : 2.5);
    ctx.setStrokeStyle(color);
    ctx.setLineCap('round');
    ctx.setLineJoin('round');
    ctx.beginPath();
    values.forEach((value, index) => index ? ctx.lineTo(xAt(index), yAt(value)) : ctx.moveTo(xAt(index), yAt(value)));
    ctx.stroke();
    values.forEach((value, index) => {
      const x = xAt(index); const y = yAt(value);
      ctx.beginPath(); ctx.setFillStyle('#fff'); ctx.setStrokeStyle(color); ctx.setLineWidth(2);
      ctx.arc(x, y, mini ? 2.5 : 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (showValues && !mini) {
        ctx.setFillStyle('#8AA89C'); ctx.setFontSize(9); ctx.setTextAlign('center');
        ctx.fillText(`${value}${unit || ''}`, x, Math.max(9, y - 8));
      }
    });
    ctx.draw();
  }, [canvasId, points, height, color, unit, showValues, mini]);

  if (!points.length) {
    return (
      <View style={{ height: `${height}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: '12px', color: colors.textMuted }}>暂无数据</Text>
      </View>
    );
  }
  return (
    <View>
      <Canvas canvasId={canvasId} id={canvasId} style={{ width: '100%', height: `${height}px`, display: 'block' }} />
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
