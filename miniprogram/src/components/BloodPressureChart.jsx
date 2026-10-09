import React, { useEffect, useRef, useState } from 'react';
import { Canvas, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { bloodPressurePoints, bloodPressurePointsForArm } from '../utils/bloodPressureTrend';
import { colors } from '../theme';

let chartSeed = 0;
const ARMS = [
  { arm: '左臂', color: '#16825F' },
  { arm: '右臂', color: '#D6334A' },
  { arm: '未标注', color: '#7B8790' },
];

export default function BloodPressureChart({ records = [], height = 108 }) {
  const canvasIds = useRef({ sys: `blood-pressure-sys-${chartSeed += 1}`, dia: `blood-pressure-dia-${chartSeed += 1}` }).current;
  const [selectedArm, setSelectedArm] = useState('');
  const allPoints = bloodPressurePoints(records, (records || []).length || 1);
  const visibleArms = ARMS.filter(({ arm }) => allPoints.some(point => point.arm === arm));
  const activeArm = visibleArms.some(({ arm }) => arm === selectedArm) ? selectedArm : visibleArms[0]?.arm;
  const points = bloodPressurePointsForArm(records, activeArm);

  useEffect(() => {
    if (!points.length) return;
    const width = 300;
    const left = 28;
    const right = width - 28;
    const xAt = index => points.length === 1 ? width / 2 : left + index * (right - left) / (points.length - 1);

    const draw = (field, showDates) => {
      const ctx = Taro.createCanvasContext(canvasIds[field]);
      const values = points.map(point => point[field]);
      const padding = Math.max((Math.max(...values) - Math.min(...values)) * 0.2, 5);
      const low = Math.min(...values) - padding;
      const high = Math.max(...values) + padding;
      const top = 19;
      const bottom = height - (showDates ? 23 : 8);
      const yAt = value => top + (high - value) * (bottom - top) / (high - low || 1);

      ctx.setStrokeStyle('#E4E8E5');
      ctx.setLineWidth(1);
      for (let row = 0; row < 3; row += 1) {
        const y = top + row * (bottom - top) / 2;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      }

      const color = ARMS.find(item => item.arm === activeArm)?.color || colors.primary;
      ctx.setStrokeStyle(color); ctx.setLineWidth(2); ctx.setLineCap('round');
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index) ctx.lineTo(xAt(index), yAt(point[field]));
        else ctx.moveTo(xAt(index), yAt(point[field]));
      });
      if (points.length > 1) ctx.stroke();
      points.forEach((point, index) => {
        const x = xAt(index); const y = yAt(point[field]);
        ctx.beginPath(); ctx.setFillStyle('#fff'); ctx.setStrokeStyle(color); ctx.setLineWidth(2);
        ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.setFillStyle(color); ctx.setFontSize(10); ctx.setTextAlign('center');
        ctx.fillText(String(point[field]), x, Math.max(11, y - 8));
      });

      if (showDates) {
        const labelStep = Math.ceil(points.length / 4);
        ctx.setFillStyle(colors.textMuted); ctx.setFontSize(9); ctx.setTextAlign('center');
        points.forEach((point, index) => {
          if (index % labelStep !== 0 && index !== points.length - 1) return;
          const date = new Date(point.recordedAt);
          ctx.fillText(`${date.getMonth() + 1}/${date.getDate()}`, xAt(index), height - 4);
        });
      }
      ctx.draw();
    };

    draw('sys', false);
    draw('dia', true);
  }, [canvasIds, records, activeArm, height]);

  if (!allPoints.length) return <Text style={{ fontSize: '12px', color: colors.textMuted }}>暂无血压记录</Text>;
  return <View>
    <View style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
      {visibleArms.map(({ arm, color }) => <View key={arm} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <View onClick={() => setSelectedArm(arm)} style={{ padding: '6px 18px', borderRadius: '999px', backgroundColor: activeArm === arm ? color : colors.background, border: `1px solid ${activeArm === arm ? color : colors.border}` }}>
          <Text style={{ fontSize: '12px', fontWeight: activeArm === arm ? 700 : 400, color: activeArm === arm ? '#fff' : colors.textSecondary }}>{arm}</Text>
        </View>
      </View>)}
    </View>
    <Text style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary }}>收缩压（mmHg）</Text>
    <Canvas canvasId={canvasIds.sys} id={canvasIds.sys} style={{ width: '100%', height: `${height}px`, display: 'block' }} />
    <View style={{ height: '1px', backgroundColor: colors.border, margin: '6px 0 8px' }} />
    <Text style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary }}>舒张压（mmHg）</Text>
    <Canvas canvasId={canvasIds.dia} id={canvasIds.dia} style={{ width: '100%', height: `${height}px`, display: 'block' }} />
  </View>;
}
