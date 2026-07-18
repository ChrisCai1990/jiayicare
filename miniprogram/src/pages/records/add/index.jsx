import React, { useState, useEffect } from 'react';
import { View, Text, Input, Button, Picker, Textarea } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { recordsAPI } from '../../../services/api';

const RECORD_TYPES = [
  { id: 'bloodPressure', label: '血压', icon: '💗', category: 'vitals', unit: 'mmHg', fields: [
    { key: 'sys', label: '收缩压', unit: 'mmHg', placeholder: '如：130' },
    { key: 'dia', label: '舒张压', unit: 'mmHg', placeholder: '如：80' },
  ] },
  { id: 'bloodSugar', label: '血糖', icon: '🩸', category: 'vitals', unit: 'mmol/L', fields: [
    { key: 'value', label: '血糖值', unit: 'mmol/L', placeholder: '如：6.1' },
  ] },
  { id: 'heartRate', label: '心率', icon: '❤️', category: 'vitals', unit: '次/分', fields: [
    { key: 'value', label: '心率', unit: '次/分', placeholder: '如：72' },
  ] },
  { id: 'weight', label: '体重', icon: '⚖️', category: 'vitals', unit: 'kg', fields: [
    { key: 'value', label: '体重', unit: 'kg', placeholder: '如：70.5' },
  ] },
  { id: 'sleep', label: '睡眠', icon: '🌙', category: 'lifestyle', unit: '小时', fields: [] },
  { id: 'mood', label: '情绪', icon: '😊', category: 'lifestyle', unit: '分', fields: [] },
  { id: 'smoking', label: '吸烟', icon: '🚬', category: 'lifestyle', unit: '支', fields: [
    { key: 'value', label: '吸烟数量', unit: '支', placeholder: '如：5' },
  ] },
  { id: 'drinking', label: '饮酒', icon: '🍷', category: 'lifestyle', unit: 'ml', fields: [
    { key: 'value', label: '饮酒量', unit: 'ml', placeholder: '如：100' },
  ] },
];

function calcSleepDuration(sleepTime, wakeTime) {
  const parse = (t) => {
    const [h, m] = t.split(':').map((v) => parseInt(v, 10) || 0);
    return h * 60 + m;
  };
  let s = parse(sleepTime);
  let w = parse(wakeTime);
  if (w <= s) w += 24 * 60;
  return ((w - s) / 60).toFixed(1);
}

export default function AddRecordPage() {
  const router = useRouter();
  const initialTypeId = router.params?.type;
  const [activeType, setActiveType] = useState(
    RECORD_TYPES.find((t) => t.id === initialTypeId) || RECORD_TYPES[0]
  );
  const [values, setValues] = useState({});
  const [sleepTime, setSleepTime] = useState('22:30');
  const [wakeTime, setWakeTime] = useState('06:30');
  const [moodScore, setMoodScore] = useState(7);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setValues({}); setError(''); }, [activeType]);

  const save = async () => {
    if (saving) return;
    setError('');
    let payload;
    if (activeType.id === 'bloodPressure') {
      const sys = parseInt(values.sys, 10);
      const dia = parseInt(values.dia, 10);
      if (!sys || !dia) { setError('请填写完整的收缩压/舒张压'); return; }
      payload = {
        type: 'bloodPressure', category: 'vitals', label: '血压', unit: 'mmHg',
        value: `${sys}/${dia}`, extra: { sys, dia },
        status: sys >= 140 || dia >= 90 ? 'warning' : sys < 90 || dia < 60 ? 'low' : 'normal',
        note,
      };
    } else if (activeType.id === 'sleep') {
      const dur = calcSleepDuration(sleepTime, wakeTime);
      const durF = parseFloat(dur);
      payload = {
        type: 'sleep', category: 'lifestyle', label: '睡眠', unit: '小时',
        value: String(dur), extra: { sleepTime, wakeTime },
        status: durF >= 7 && durF <= 9 ? 'normal' : durF < 7 ? 'low' : 'warning',
        note,
      };
    } else if (activeType.id === 'mood') {
      payload = {
        type: 'mood', category: 'lifestyle', label: '情绪', unit: '分',
        value: String(moodScore), status: 'normal', note,
      };
    } else {
      const v = values.value;
      if (!v) { setError('请填写数值'); return; }
      const num = parseFloat(v);
      let status = 'normal';
      if (activeType.id === 'bloodSugar') status = num > 7 ? 'warning' : num < 3.9 ? 'low' : 'normal';
      else if (activeType.id === 'heartRate') status = num > 100 ? 'warning' : num < 60 ? 'low' : 'normal';
      else if (activeType.id === 'smoking') status = num > 0 ? 'warning' : 'normal';
      else if (activeType.id === 'drinking') status = num > 0 ? 'warning' : 'normal';
      payload = {
        type: activeType.id, category: activeType.category, label: activeType.label,
        unit: activeType.unit, value: String(v), status, note,
      };
    }

    setSaving(true);
    try {
      await recordsAPI.create(payload);
      Taro.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => Taro.navigateBack(), 800);
    } catch (err) {
      setError(err.message || '保存失败，请重试');
    } finally { setSaving(false); }
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${spacing.lg}px` }}>
      {/* 类型选择 */}
      <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: `${spacing.lg}px` }}>
        {RECORD_TYPES.map((t) => (
          <View
            key={t.id}
            onClick={() => setActiveType(t)}
            style={{
              padding: '8px 14px', borderRadius: `${radius.full}px`,
              backgroundColor: activeType.id === t.id ? colors.primary : '#fff',
              border: `1px solid ${activeType.id === t.id ? colors.primary : colors.border}`,
            }}
          >
            <Text style={{ fontSize: '13px', color: activeType.id === t.id ? '#fff' : colors.textPrimary, fontWeight: 600 }}>
              {t.icon} {t.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.lg}px`, marginBottom: `${spacing.md}px` }}>
        {activeType.id === 'sleep' ? (
          <>
            <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>入睡时间</Text>
            <Picker mode="time" value={sleepTime} onChange={(e) => setSleepTime(e.detail.value)}>
              <View style={{ padding: '12px', border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, marginBottom: `${spacing.md}px` }}>
                <Text>{sleepTime}</Text>
              </View>
            </Picker>
            <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>醒来时间</Text>
            <Picker mode="time" value={wakeTime} onChange={(e) => setWakeTime(e.detail.value)}>
              <View style={{ padding: '12px', border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px` }}>
                <Text>{wakeTime}</Text>
              </View>
            </Picker>
            <Text style={{ fontSize: '12px', color: colors.textMuted, marginTop: '8px', display: 'block' }}>
              预计时长：{calcSleepDuration(sleepTime, wakeTime)} 小时
            </Text>
          </>
        ) : activeType.id === 'mood' ? (
          <>
            <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>情绪评分（1-10分）</Text>
            <Picker mode="selector" range={Array.from({ length: 10 }, (_, i) => String(i + 1))} value={moodScore - 1}
              onChange={(e) => setMoodScore(parseInt(e.detail.value, 10) + 1)}>
              <View style={{ padding: '12px', border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px` }}>
                <Text>{moodScore} 分</Text>
              </View>
            </Picker>
          </>
        ) : (
          activeType.fields.map((f) => (
            <View key={f.key} style={{ marginBottom: `${spacing.md}px` }}>
              <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>
                {f.label}（{f.unit}）
              </Text>
              <View style={{ border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px' }}>
                <Input
                  type="digit"
                  placeholder={f.placeholder}
                  value={values[f.key] || ''}
                  onInput={(e) => setValues((v) => ({ ...v, [f.key]: e.detail.value }))}
                />
              </View>
            </View>
          ))
        )}

        <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', margin: '12px 0 8px' }}>备注（可选）</Text>
        <Textarea
          style={{ width: '100%', border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', minHeight: '60px' }}
          placeholder="添加备注..."
          value={note}
          onInput={(e) => setNote(e.detail.value)}
        />
      </View>

      {!!error && (
        <View style={{ backgroundColor: colors.danger10, borderRadius: `${radius.sm}px`, padding: '10px', marginBottom: `${spacing.md}px` }}>
          <Text style={{ fontSize: '13px', color: colors.danger }}>{error}</Text>
        </View>
      )}

      <Button
        style={{ backgroundColor: colors.primary, color: '#fff', borderRadius: `${radius.md}px`, height: '50px', lineHeight: '50px', fontSize: '16px', fontWeight: 700 }}
        loading={saving}
        onClick={save}
      >
        保存记录
      </Button>
    </View>
  );
}
