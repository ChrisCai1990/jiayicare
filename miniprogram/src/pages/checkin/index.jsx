import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Input, Picker } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { recordsAPI } from '../../services/api';

// 对齐 app/src/screens/checkin/CheckinScreen.js（2026-07-18 打卡页重构）：
// 必打卡/可选打卡区分（按慢病标签）、时段选择（运动）、症状自评（含紧急症状提示）、
// 生理指标原地弹窗、日期归属选择（今天/昨天/前天）。

function toLocalDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const CHECKIN_DEFS = {
  diet:          { key: 'diet',          label: '饮食', icon: '🍽️', color: '#059669', measureType: null,            category: 'lifestyle', recordLabel: '饮食打卡', allowMultiple: true },
  exercise:      { key: 'exercise',      label: '运动', icon: '🏃', color: '#0369A1', measureType: null,            category: 'lifestyle', recordLabel: '运动打卡', allowMultiple: true },
  sleep:         { key: 'sleep',         label: '睡眠', icon: '🌙', color: '#4F46E5', measureType: 'sleep',         category: 'lifestyle', recordLabel: '睡眠打卡' },
  weight:        { key: 'weight',        label: '体重', icon: '⚖️', color: '#059669', measureType: 'weight',        category: 'vitals',    recordLabel: '体重打卡' },
  bowel:         { key: 'bowel',         label: '排便', icon: '🍃', color: '#92400E', measureType: null,            category: 'lifestyle', recordLabel: '排便打卡' },
  water:         { key: 'water',         label: '饮水', icon: '💧', color: '#0EA5E9', measureType: null,            category: 'lifestyle', recordLabel: '饮水打卡' },
  smoking:       { key: 'smoking',       label: '吸烟', icon: '🚬', color: '#6B7280', measureType: null,            category: 'lifestyle', recordLabel: '吸烟记录' },
  alcohol:       { key: 'alcohol',       label: '饮酒', icon: '🍷', color: '#9D174D', measureType: null,            category: 'lifestyle', recordLabel: '饮酒记录' },
  bloodPressure: { key: 'bloodPressure', label: '血压', icon: '💗', color: '#DC3545', measureType: 'bloodPressure', category: 'vitals',    recordLabel: '血压打卡', allowMultiple: true, chronicKeys: ['高血压'] },
  heartRate:     { key: 'heartRate',     label: '心率', icon: '❤️', color: '#DC3545', measureType: 'heartRate',     category: 'vitals',    recordLabel: '心率打卡' },
  bloodSugar:    { key: 'bloodSugar',    label: '血糖', icon: '🩸', color: '#F39C12', measureType: 'bloodSugar',    category: 'vitals',    recordLabel: '血糖打卡', allowMultiple: true, chronicKeys: ['糖尿病'] },
  mood:          { key: 'mood',          label: '情绪', icon: '😊', color: '#7C3AED', measureType: 'mood',          category: 'lifestyle', recordLabel: '情绪打卡' },
  symptom:       { key: 'symptom',       label: '不适', icon: '🩹', color: '#DC2626', measureType: 'symptom',       category: 'vitals',    recordLabel: '症状自评', optional: true },
};

const FIXED_CHECKIN_KEYS = ['diet','exercise','sleep','weight','bowel','water','smoking','alcohol','bloodPressure','heartRate','bloodSugar','mood'];

const MEASURE_FIELDS = {
  bloodPressure: [
    { key: 'sys', label: '收缩压', unit: 'mmHg', placeholder: '如：130' },
    { key: 'dia', label: '舒张压', unit: 'mmHg', placeholder: '如：80' },
  ],
  bloodSugar: [{ key: 'value', label: '血糖值', unit: 'mmol/L', placeholder: '如：6.1' }],
  heartRate:  [{ key: 'value', label: '心率', unit: '次/分', placeholder: '如：72' }],
  weight:     [{ key: 'value', label: '体重', unit: 'kg', placeholder: '如：70.5' }],
  mood:       [{ key: 'value', label: '情绪评分', unit: '分', placeholder: '1-10分' }],
  sleep: [],
};
const MEASURE_OPTIONS = { bloodSugar: ['空腹', '餐后2小时', '睡前', '随机'], bloodPressure: ['左臂', '右臂'] };

const SYMPTOM_OPTIONS = ['头晕', '乏力', '心悸', '腹泻', '恶心', '失眠', '关节疼痛', '皮疹'];
const URGENT_SYMPTOMS = ['胸痛', '呼吸困难'];
const ALL_SYMPTOM_OPTIONS = [...SYMPTOM_OPTIONS, ...URGENT_SYMPTOMS];

const EXERCISE_TIME_SLOTS = ['早上', '上午', '中午', '下午', '晚上'];
function deriveCurrentTimeSlot() {
  const h = new Date().getHours();
  if (h < 9) return '早上';
  if (h < 12) return '上午';
  if (h < 14) return '中午';
  if (h < 18) return '下午';
  return '晚上';
}

function calcSleepDuration(sleepTime, wakeTime) {
  const parse = (t) => {
    const parts = t.replace('：', ':').split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  };
  let s = parse(sleepTime);
  let w = parse(wakeTime);
  if (w <= s) w += 24 * 60;
  return ((w - s) / 60).toFixed(1);
}

function Chip({ label, active, color, onClick }) {
  return (
    <View onClick={onClick} style={{
      padding: '6px 14px', borderRadius: `${radius.sm}px`,
      backgroundColor: active ? color : colors.border + '50',
      border: `1px solid ${active ? color : colors.border}`,
    }}>
      <Text style={{ fontSize: '13px', fontWeight: active ? 700 : 500, color: active ? '#fff' : colors.textSecondary }}>{label}</Text>
    </View>
  );
}

export default function CheckinPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [doneTypes, setDoneTypes] = useState({});

  const todayStr = toLocalDateStr(new Date());
  const [checkinDate, setCheckinDate] = useState(todayStr);

  const [checkinModal, setCheckinModal] = useState(null);
  const [checkinNote, setCheckinNote] = useState('');
  const [checkinMealType, setCheckinMealType] = useState('');
  const [checkinTimeSlot, setCheckinTimeSlot] = useState('');
  const [checkinSaving, setCheckinSaving] = useState(false);

  const [measureModal, setMeasureModal] = useState(null);
  const [measureValues, setMeasureValues] = useState({});
  const [measureOption, setMeasureOption] = useState('');
  const [measureNote, setMeasureNote] = useState('');
  const [measureSaving, setMeasureSaving] = useState(false);

  const [symptomModal, setSymptomModal] = useState(false);
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [symptomNote, setSymptomNote] = useState('');
  const [symptomSaving, setSymptomSaving] = useState(false);

  const loadTodayStatus = useCallback(async () => {
    try {
      const res = await recordsAPI.todayStatus();
      if (res.success) setDoneTypes(res.doneTypes || {});
    } catch {}
    finally { setLoading(false); }
  }, []);

  useDidShow(() => { loadTodayStatus(); });

  const chronicDiseases = user?.chronicDiseases || [];
  const isMandatory = (item) => {
    if (item.optional) return false;
    if (!item.chronicKeys) return true;
    return item.chronicKeys.some((k) => chronicDiseases.includes(k));
  };

  const mandatoryItems = FIXED_CHECKIN_KEYS.map((k) => CHECKIN_DEFS[k]).filter(isMandatory);
  const optionalItems  = FIXED_CHECKIN_KEYS.map((k) => CHECKIN_DEFS[k]).filter((item) => !isMandatory(item));
  const symptomItem = CHECKIN_DEFS.symptom;

  const isItemDone = (item) => !!doneTypes[item.key] || (item.measureType && !!doneTypes[item.measureType]);
  const doneMandatoryCount = mandatoryItems.filter(isItemDone).length;
  const allMandatoryDone = mandatoryItems.length > 0 && doneMandatoryCount === mandatoryItems.length;

  const openCheckinModal = (item) => {
    if (isItemDone(item) && !item.allowMultiple) {
      Taro.showToast({ title: '今天已经打过卡了，明天再来吧～', icon: 'none' });
      return;
    }
    if (item.measureType) {
      setMeasureValues({});
      setMeasureOption('');
      setMeasureNote('');
      setMeasureModal(item);
    } else {
      setCheckinNote('');
      setCheckinMealType('');
      setCheckinTimeSlot(item.key === 'exercise' ? '现在' : '');
      setCheckinDate(todayStr);
      setCheckinModal(item);
    }
  };

  const saveMeasureCheckin = async () => {
    if (measureSaving) return;
    const item = measureModal;
    const measureType = item.measureType;
    const fields = MEASURE_FIELDS[measureType] || [];
    const isToday = checkinDate === todayStr;

    const hasValue = measureType === 'sleep'
      ? (measureValues.sleepTime && measureValues.wakeTime)
      : fields.every((f) => measureValues[f.key]);
    if (!hasValue) {
      Taro.showToast({ title: measureType === 'sleep' ? '请填写入睡和醒来时间' : '请填写完整数值', icon: 'none' });
      return;
    }

    let payload = {
      category: item.category || 'vitals',
      type: measureType,
      label: item.recordLabel || item.label,
      unit: fields[0]?.unit || '',
      note: [measureOption, measureNote].filter(Boolean).join(' · '),
      recordedAt: isToday ? new Date().toISOString() : `${checkinDate}T12:00:00`,
    };

    if (measureType === 'bloodPressure') {
      const sys = parseInt(measureValues.sys, 10);
      const dia = parseInt(measureValues.dia, 10);
      payload.value = `${sys}/${dia}`;
      payload.extra = { sys, dia };
      payload.status = sys >= 140 || dia >= 90 ? 'warning' : sys < 90 || dia < 60 ? 'low' : 'normal';
    } else if (measureType === 'sleep') {
      const dur = calcSleepDuration(measureValues.sleepTime, measureValues.wakeTime);
      payload.value = String(dur);
      payload.unit = '小时';
      payload.extra = { sleepTime: measureValues.sleepTime, wakeTime: measureValues.wakeTime };
      const durF = parseFloat(dur);
      payload.status = durF >= 7 && durF <= 9 ? 'normal' : durF < 7 ? 'low' : 'warning';
    } else {
      payload.value = String(measureValues.value);
      const v = parseFloat(measureValues.value);
      payload.status = measureType === 'bloodSugar' ? (v > 7 ? 'warning' : v < 3.9 ? 'low' : 'normal')
        : measureType === 'heartRate' ? (v > 100 ? 'warning' : v < 60 ? 'low' : 'normal')
        : measureType === 'mood' ? (v >= 6 ? 'normal' : 'warning')
        : 'normal';
      if (measureType === 'bloodSugar' && measureOption) payload.extra = { mealType: measureOption };
    }

    setMeasureSaving(true);
    try {
      await recordsAPI.create(payload);
    } catch (err) {
      setMeasureSaving(false);
      Taro.showToast({ title: err.message || '保存失败', icon: 'none' });
      return;
    }
    setMeasureSaving(false);
    setMeasureModal(null);
    if (isToday) loadTodayStatus();
  };

  const saveCheckin = async () => {
    if (checkinSaving) return;
    const item = checkinModal;
    if (item.key === 'diet' && !checkinMealType) {
      Taro.showToast({ title: '请选择餐次', icon: 'none' });
      return;
    }
    const isToday = checkinDate === todayStr;
    const resolvedTimeSlot = item.key === 'exercise'
      ? (checkinTimeSlot === '现在' ? deriveCurrentTimeSlot() : checkinTimeSlot)
      : '';
    setCheckinSaving(true);
    const mealPrefix = item.key === 'diet' && checkinMealType ? `【${checkinMealType}】` : '';
    const slotPrefix = resolvedTimeSlot ? `【${resolvedTimeSlot}】` : '';
    try {
      await recordsAPI.create({
        category: item.category || 'lifestyle',
        type: item.key,
        label: mealPrefix ? `${item.recordLabel || item.label}·${checkinMealType}`
          : slotPrefix ? `${item.recordLabel || item.label}·${resolvedTimeSlot}`
          : (item.recordLabel || item.label),
        value: (mealPrefix + slotPrefix + checkinNote) || checkinMealType || resolvedTimeSlot || '已打卡',
        note: '',
        status: 'normal',
        extra: {
          ...(checkinMealType ? { mealType: checkinMealType } : {}),
          ...(resolvedTimeSlot ? { timeSlot: resolvedTimeSlot } : {}),
        },
        recordedAt: isToday ? new Date().toISOString() : `${checkinDate}T12:00:00`,
      });
    } catch (err) {
      setCheckinSaving(false);
      Taro.showToast({ title: err.message || '保存失败', icon: 'none' });
      return;
    }
    setCheckinSaving(false);
    setCheckinModal(null);
    if (isToday) loadTodayStatus();
  };

  const toggleSymptom = (s) => {
    setSelectedSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const saveSymptom = async () => {
    if (symptomSaving) return;
    if (selectedSymptoms.length === 0 && !symptomNote.trim()) {
      Taro.showToast({ title: '请选择或填写症状', icon: 'none' });
      return;
    }
    const hasUrgent = selectedSymptoms.some((s) => URGENT_SYMPTOMS.includes(s));
    setSymptomSaving(true);
    try {
      await recordsAPI.create({
        category: 'vitals',
        type: 'symptom',
        label: '症状自评',
        value: selectedSymptoms.join('、') || '其他不适',
        note: symptomNote,
        status: hasUrgent ? 'danger' : 'normal',
        extra: { symptoms: selectedSymptoms },
        recordedAt: new Date().toISOString(),
      });
    } catch (err) {
      setSymptomSaving(false);
      Taro.showToast({ title: err.message || '保存失败', icon: 'none' });
      return;
    }
    setSymptomSaving(false);
    setSymptomModal(false);
    setSelectedSymptoms([]);
    setSymptomNote('');
    loadTodayStatus();
    if (hasUrgent) {
      Taro.showModal({ title: '建议尽快联系医师', content: '您选择的症状可能需要及时处理，建议立即联系您的家庭医生或健康管理师。', showCancel: false });
    }
  };

  const renderCheckinItem = (item) => {
    const isDone = isItemDone(item);
    return (
      <View key={item.key} onClick={() => openCheckinModal(item)} style={{
        width: 'calc(25% - 8px)', alignItems: 'center', textAlign: 'center', padding: '10px 4px',
        borderRadius: `${radius.md}px`, border: `1px solid ${isDone ? item.color + '40' : colors.border}`,
        backgroundColor: isDone ? item.color + '15' : '#fff',
      }}>
        <Text style={{ fontSize: '18px', display: 'block' }}>{isDone ? '✅' : item.icon}</Text>
        <Text style={{ fontSize: '11px', color: isDone ? item.color : colors.textSecondary, fontWeight: isDone ? 700 : 500, marginTop: '2px' }}>{item.label}</Text>
      </View>
    );
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${spacing.lg}px` }}>
      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
      ) : (
        <>
          {/* 必打卡项 */}
          <View style={{ marginBottom: `${spacing.lg}px` }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
              <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>必打卡项</Text>
              {mandatoryItems.length > 0 && (
                <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.primary }}>{doneMandatoryCount}/{mandatoryItems.length}</Text>
              )}
            </View>
            <View style={{ display: 'flex', flexWrap: 'wrap', gap: `${spacing.sm}px` }}>
              {mandatoryItems.map(renderCheckinItem)}
            </View>
            {allMandatoryDone && (
              <View style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: `${spacing.sm}px`, padding: `${spacing.sm}px`, backgroundColor: '#FEF9E7', borderRadius: `${radius.sm}px` }}>
                <Text style={{ fontSize: '12px', color: '#B7791F', fontWeight: 600 }}>⭐ 今日核心指标已完成！保持健康好习惯 🎉</Text>
              </View>
            )}
          </View>

          {/* 可选打卡项 */}
          {optionalItems.length > 0 && (
            <View style={{ marginBottom: `${spacing.lg}px` }}>
              <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>可选打卡项</Text>
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: `${spacing.sm}px` }}>
                {optionalItems.map(renderCheckinItem)}
              </View>
            </View>
          )}

          {/* 症状自评 */}
          <View style={{ marginBottom: `${spacing.lg}px` }}>
            <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>今天有不适吗？</Text>
            <View onClick={() => setSymptomModal(true)} style={{
              display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: '#fff',
              borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.md}px`,
            }}>
              <Text style={{ fontSize: '18px' }}>{doneTypes.symptom ? '✅' : symptomItem.icon}</Text>
              <Text style={{ flex: 1, fontSize: '13px', color: colors.textSecondary }}>
                {doneTypes.symptom ? '今天已记录不适情况' : '点击选择症状或描述不适（可选）'}
              </Text>
              <Text style={{ fontSize: '13px', color: colors.textMuted }}>›</Text>
            </View>
          </View>
        </>
      )}

      {/* 生活方式打卡弹窗 */}
      {checkinModal && (
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: `${spacing.lg}px`, width: '100%', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto' }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>{checkinModal.icon} {checkinModal.label} 打卡</Text>
              <View onClick={() => setCheckinModal(null)}><Text style={{ fontSize: '20px', color: colors.textMuted }}>×</Text></View>
            </View>

            <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>这是哪一天的情况</Text>
            <View style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              {[{ label: '今天', d: 0 }, { label: '昨天', d: 1 }, { label: '前天', d: 2 }].map(({ label, d }) => {
                const dt = new Date(); dt.setDate(dt.getDate() - d);
                const ds = toLocalDateStr(dt);
                return <Chip key={label} label={label} active={checkinDate === ds} color={checkinModal.color} onClick={() => setCheckinDate(ds)} />;
              })}
            </View>
            <Picker mode="date" value={checkinDate} end={todayStr} onChange={(e) => setCheckinDate(e.detail.value)}>
              <View style={{ border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '8px 10px', marginBottom: '14px', display: 'inline-block' }}>
                <Text style={{ fontSize: '13px', color: colors.textPrimary }}>当前记录归属：{checkinDate}</Text>
              </View>
            </Picker>

            {checkinModal.key === 'diet' && (
              <>
                <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>这是哪一餐</Text>
                <View style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  {['早餐', '午餐', '晚餐', '加餐'].map((mt) => (
                    <Chip key={mt} label={mt} active={checkinMealType === mt} color={checkinModal.color} onClick={() => setCheckinMealType(mt)} />
                  ))}
                </View>
              </>
            )}

            {checkinModal.key === 'exercise' && (
              <>
                <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>运动时段（可选）</Text>
                <View style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  {['现在', ...EXERCISE_TIME_SLOTS].map((slot) => (
                    <Chip key={slot} label={slot} active={checkinTimeSlot === slot} color={checkinModal.color} onClick={() => setCheckinTimeSlot(slot)} />
                  ))}
                </View>
              </>
            )}

            <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>记录内容（可选）</Text>
            <Input
              style={{ border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', fontSize: '14px', backgroundColor: colors.background, boxSizing: 'border-box', width: '100%' }}
              placeholder={`记录今天的${checkinModal.label}情况...`}
              value={checkinNote}
              onInput={(e) => setCheckinNote(e.detail.value)}
            />

            <View style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <View onClick={() => setCheckinModal(null)} style={{ flex: 1, textAlign: 'center', padding: '13px 0', borderRadius: `${radius.md}px`, backgroundColor: colors.border }}>
                <Text style={{ fontSize: '15px', fontWeight: 600, color: colors.textSecondary }}>取消</Text>
              </View>
              <View onClick={checkinSaving ? undefined : saveCheckin} style={{ flex: 2, textAlign: 'center', padding: '13px 0', borderRadius: `${radius.md}px`, backgroundColor: checkinModal.color, opacity: checkinSaving ? 0.6 : 1 }}>
                <Text style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{checkinSaving ? '保存中...' : '完成打卡'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 生理指标打卡弹窗 */}
      {measureModal && (
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: `${spacing.lg}px`, width: '100%', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto' }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>{measureModal.icon} {measureModal.label} 打卡</Text>
              <View onClick={() => setMeasureModal(null)}><Text style={{ fontSize: '20px', color: colors.textMuted }}>×</Text></View>
            </View>

            {MEASURE_OPTIONS[measureModal.measureType] && (
              <View style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                {MEASURE_OPTIONS[measureModal.measureType].map((opt) => (
                  <Chip key={opt} label={opt} active={measureOption === opt} color={colors.primary} onClick={() => setMeasureOption(opt)} />
                ))}
              </View>
            )}

            {measureModal.measureType === 'sleep' ? (
              <View>
                {[{ key: 'sleepTime', label: '入睡时间', placeholder: '如：22:30' }, { key: 'wakeTime', label: '醒来时间', placeholder: '如：06:30' }].map((f) => (
                  <View key={f.key} style={{ marginBottom: '12px' }}>
                    <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>{f.label}</Text>
                    <Input
                      style={{ border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', fontSize: '14px', backgroundColor: colors.background, boxSizing: 'border-box', width: '100%' }}
                      placeholder={f.placeholder}
                      value={measureValues[f.key] || ''}
                      onInput={(e) => setMeasureValues((prev) => ({ ...prev, [f.key]: e.detail.value }))}
                    />
                  </View>
                ))}
                {measureValues.sleepTime && measureValues.wakeTime ? (
                  <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>
                    睡眠时长：<Text style={{ fontWeight: 700, color: '#7B68EE' }}>{calcSleepDuration(measureValues.sleepTime, measureValues.wakeTime)} 小时</Text>
                  </Text>
                ) : null}
              </View>
            ) : (
              (MEASURE_FIELDS[measureModal.measureType] || []).map((field) => (
                <View key={field.key} style={{ marginBottom: '12px' }}>
                  <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '4px' }}>{field.label}</Text>
                  <View style={{ display: 'flex', alignItems: 'center', backgroundColor: colors.background, borderRadius: `${radius.sm}px`, border: `1.5px solid ${colors.border}`, padding: `${spacing.sm}px` }}>
                    <Input
                      type="digit"
                      style={{ flex: 1, fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}
                      placeholder={field.placeholder}
                      value={measureValues[field.key] || ''}
                      onInput={(e) => setMeasureValues((prev) => ({ ...prev, [field.key]: e.detail.value }))}
                    />
                    <Text style={{ fontSize: '12px', color: colors.textMuted }}>{field.unit}</Text>
                  </View>
                </View>
              ))
            )}

            <View style={{ marginBottom: '12px' }}>
              <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>备注（可选，如异常原因）</Text>
              <Input
                style={{ border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', fontSize: '14px', backgroundColor: colors.background, boxSizing: 'border-box', width: '100%' }}
                placeholder="如：血压偏高，昨晚熬夜了"
                value={measureNote}
                onInput={(e) => setMeasureNote(e.detail.value)}
              />
            </View>

            <View style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <View onClick={() => setMeasureModal(null)} style={{ flex: 1, textAlign: 'center', padding: '13px 0', borderRadius: `${radius.md}px`, backgroundColor: colors.border }}>
                <Text style={{ fontSize: '15px', fontWeight: 600, color: colors.textSecondary }}>取消</Text>
              </View>
              <View onClick={measureSaving ? undefined : saveMeasureCheckin} style={{ flex: 2, textAlign: 'center', padding: '13px 0', borderRadius: `${radius.md}px`, backgroundColor: measureModal.color, opacity: measureSaving ? 0.6 : 1 }}>
                <Text style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{measureSaving ? '保存中...' : '完成打卡'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 症状自评弹窗 */}
      {symptomModal && (
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: `${spacing.lg}px`, width: '100%', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto' }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>今天有哪些不适？</Text>
              <View onClick={() => setSymptomModal(false)}><Text style={{ fontSize: '20px', color: colors.textMuted }}>×</Text></View>
            </View>

            <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
              {ALL_SYMPTOM_OPTIONS.map((s) => {
                const active = selectedSymptoms.includes(s);
                const urgent = URGENT_SYMPTOMS.includes(s);
                return (
                  <View key={s} onClick={() => toggleSymptom(s)} style={{
                    padding: '8px 14px', borderRadius: `${radius.sm}px`,
                    backgroundColor: active ? (urgent ? colors.danger : colors.primary) : colors.border + '50',
                    border: `1px solid ${active ? (urgent ? colors.danger : colors.primary) : colors.border}`,
                  }}>
                    <Text style={{ fontSize: '13px', fontWeight: active ? 700 : 500, color: active ? '#fff' : colors.textSecondary }}>{s}</Text>
                  </View>
                );
              })}
            </View>

            <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>其他描述（可选）</Text>
            <Input
              style={{ border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', fontSize: '14px', backgroundColor: colors.background, boxSizing: 'border-box', width: '100%' }}
              placeholder="描述具体不适情况，如部位、持续时间等"
              value={symptomNote}
              onInput={(e) => setSymptomNote(e.detail.value)}
            />

            <View style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <View onClick={() => setSymptomModal(false)} style={{ flex: 1, textAlign: 'center', padding: '13px 0', borderRadius: `${radius.md}px`, backgroundColor: colors.border }}>
                <Text style={{ fontSize: '15px', fontWeight: 600, color: colors.textSecondary }}>取消</Text>
              </View>
              <View onClick={symptomSaving ? undefined : saveSymptom} style={{ flex: 2, textAlign: 'center', padding: '13px 0', borderRadius: `${radius.md}px`, backgroundColor: colors.primary, opacity: symptomSaving ? 0.6 : 1 }}>
                <Text style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{symptomSaving ? '保存中...' : '提交'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
