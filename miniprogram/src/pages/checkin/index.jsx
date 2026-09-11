import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Input, Picker, Image, Textarea } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { recordsAPI } from '../../services/api';
import BloodPressurePhoto from '../../components/BloodPressurePhoto';
import BloodSugarPhoto from '../../components/BloodSugarPhoto';
import WeightPhoto from '../../components/WeightPhoto';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';
import { chooseImageWithPrivacy, showImagePickerError } from '../../utils/imagePicker';

// 对齐 app/src/screens/checkin/CheckinScreen.js（2026-07-18 打卡页重构）：
// 必打卡/可选打卡区分（按慢病标签）、时段选择（运动）、症状自评（含紧急症状提示）、
// 生理指标原地弹窗、日期归属选择（今天/昨天/前天）。

function toLocalDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const CHECKIN_DEFS = {
  diet:          { key: 'diet',          label: '饮食', icon: '🍽️', color: '#059669', measureType: null,            category: 'lifestyle', recordLabel: '饮食记录', allowMultiple: true },
  exercise:      { key: 'exercise',      label: '运动', icon: '🏃', color: '#0369A1', measureType: null,            category: 'lifestyle', recordLabel: '运动记录', allowMultiple: true },
  sleep:         { key: 'sleep',         label: '睡眠', icon: '🌙', color: '#4F46E5', measureType: 'sleep',         category: 'lifestyle', recordLabel: '睡眠记录' },
  weight:        { key: 'weight',        label: '体重', icon: '⚖️', color: '#059669', measureType: 'weight',        category: 'vitals',    recordLabel: '体重记录' },
  bowel:         { key: 'bowel',         label: '排便', icon: '🍃', color: '#92400E', measureType: null,            category: 'lifestyle', recordLabel: '排便记录' },
  water:         { key: 'water',         label: '饮水', icon: '💧', color: '#0EA5E9', measureType: null,            category: 'lifestyle', recordLabel: '饮水记录' },
  smoking:       { key: 'smoking',       label: '吸烟', icon: '🚬', color: '#6B7280', measureType: null,            category: 'lifestyle', recordLabel: '吸烟记录' },
  alcohol:       { key: 'alcohol',       label: '饮酒', icon: '🍷', color: '#9D174D', measureType: null,            category: 'lifestyle', recordLabel: '饮酒记录' },
  bloodPressure: { key: 'bloodPressure', label: '血压', icon: '💗', color: '#DC3545', measureType: 'bloodPressure', category: 'vitals',    recordLabel: '血压记录', allowMultiple: true, chronicKeys: ['高血压'] },
  heartRate:     { key: 'heartRate',     label: '心率', icon: '❤️', color: '#DC3545', measureType: 'heartRate',     category: 'vitals',    recordLabel: '心率记录' },
  bloodSugar:    { key: 'bloodSugar',    label: '血糖', icon: '🩸', color: '#F39C12', measureType: 'bloodSugar',    category: 'vitals',    recordLabel: '血糖记录', allowMultiple: true, chronicKeys: ['糖尿病'] },
  mood:          { key: 'mood',          label: '情绪', icon: '😊', color: '#7C3AED', measureType: 'mood',          category: 'lifestyle', recordLabel: '情绪记录' },
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
const BATCH_INPUT_STYLE = { minHeight: '44px', boxSizing: 'border-box', width: '100%', padding: '8px 12px', fontSize: '14px', color: '#1A2B24', backgroundColor: '#F2EDE3', border: '1px solid #E0D9CE', borderRadius: '10px' };

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

function shiftDate(baseDate, days) {
  const date = new Date(`${baseDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toLocalDateStr(date);
}

export function parseQuickHealthText(text, fallbackDate, todayDate) {
  const rows = [];
  const unmatchedLines = [];
  String(text || '').split(/\r?\n/).map((line) => line.replace(/^[\s👉☀️🌞*-]+/, '').trim()).filter(Boolean).forEach((line) => {
    if (/^(?:每日|今日)?健康数据(?:记录|打卡)?[☀️🌞]*$/.test(line)) return;
    const explicit = line.match(/(20\d{2})[年\/-](\d{1,2})[月\/-](\d{1,2})日?/);
    const date = explicit ? `${explicit[1]}-${String(explicit[2]).padStart(2, '0')}-${String(explicit[3]).padStart(2, '0')}`
      : /前天|前日/.test(line) ? shiftDate(todayDate, -2)
        : /昨天|昨日/.test(line) ? shiftDate(todayDate, -1)
          : /今天|今日/.test(line) ? todayDate : fallbackDate;
    const recordedAt = date === todayDate ? new Date().toISOString() : `${date}T12:00:00`;
    const clean = line.replace(/20\d{2}[年\/-]\d{1,2}[月\/-]\d{1,2}日?|今天|今日|昨天|昨日|前天|前日/g, '').replace(/^[：:\s]+/, '').trim();
    let match;
    if ((match = clean.match(/(?:空腹)?体重[^\d]*(\d+(?:\.\d+)?)\s*(斤|kg|公斤)/i))) {
      const enteredValue = Number(match[1]), enteredUnit = /斤/.test(match[2]) ? '斤' : 'kg';
      const kg = enteredUnit === '斤' ? enteredValue / 2 : enteredValue;
      rows.push({ category: 'vitals', type: 'weight', label: '体重记录', unit: 'kg', value: String(Math.round(kg * 100) / 100), extra: { enteredValue, enteredUnit }, recordedAt, preview: `${date} 体重 ${enteredValue}${enteredUnit}（${Math.round(kg * 100) / 100}kg）`, _sourceLine: line });
    } else if ((match = clean.match(/血压[^\d]*(\d{2,3})\s*[\/／]\s*(\d{2,3})/))) {
      const sys = Number(match[1]), dia = Number(match[2]);
      rows.push({ category: 'vitals', type: 'bloodPressure', label: '血压记录', unit: 'mmHg', value: `${sys}/${dia}`, extra: { sys, dia }, recordedAt, preview: `${date} 血压 ${sys}/${dia}mmHg`, _sourceLine: line });
    } else if ((match = clean.match(/血糖[^\d]*(\d+(?:\.\d+)?)/))) {
      rows.push({ category: 'vitals', type: 'bloodSugar', label: '血糖记录', unit: 'mmol/L', value: match[1], recordedAt, preview: `${date} 血糖 ${match[1]}mmol/L`, _sourceLine: line });
    } else if (/饮水/.test(clean)) {
      rows.push({ category: 'lifestyle', type: 'water', label: '饮水记录', value: clean, recordedAt, preview: `${date} ${clean}`, _sourceLine: line });
    } else if (/排便/.test(clean)) {
      rows.push({ category: 'lifestyle', type: 'bowel', label: '排便记录', value: clean, recordedAt, preview: `${date} ${clean}`, _sourceLine: line });
    } else if (/运动|步数|步行|快走|跑步|抗阻|健身/.test(clean)) {
      rows.push({ category: 'lifestyle', type: 'exercise', label: '运动记录', value: clean, recordedAt, preview: `${date} ${clean}`, _sourceLine: line });
    } else if ((match = clean.match(/心率[^\d]*(\d+)/))) {
      rows.push({ category: 'vitals', type: 'heartRate', label: '心率记录', unit: '次/分', value: match[1], recordedAt, preview: `${date} 心率 ${match[1]}次/分`, _sourceLine: line });
    } else if (/早餐|午餐|晚餐|加餐|饮食/.test(clean)) {
      const mealType = ['早餐', '午餐', '晚餐', '加餐'].find((meal) => clean.includes(meal)) || '';
      rows.push({ category: 'lifestyle', type: 'diet', label: mealType ? `饮食记录·${mealType}` : '饮食记录', value: clean, extra: mealType ? { mealType } : {}, recordedAt, preview: `${date} ${clean}`, _sourceLine: line });
    } else if (/睡眠|入睡|睡了/.test(clean)) rows.push({ category: 'lifestyle', type: 'sleep', label: '睡眠记录', value: clean, recordedAt, preview: `${date} ${clean}`, _sourceLine: line });
    else if (/吸烟/.test(clean)) rows.push({ category: 'lifestyle', type: 'smoking', label: '吸烟记录', value: clean, recordedAt, preview: `${date} ${clean}`, _sourceLine: line });
    else if (/饮酒|喝酒/.test(clean)) rows.push({ category: 'lifestyle', type: 'alcohol', label: '饮酒记录', value: clean, recordedAt, preview: `${date} ${clean}`, _sourceLine: line });
    else unmatchedLines.push(line);
  });
  rows.unmatchedLines = unmatchedLines;
  return rows;
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
  const { statusBarHeight } = useNavBar();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [doneTypes, setDoneTypes] = useState({});
  const [recordedDates, setRecordedDates] = useState({});

  const todayStr = toLocalDateStr(new Date());
  const [checkinDate, setCheckinDate] = useState(todayStr);

  const [checkinModal, setCheckinModal] = useState(null);
  const [checkinNote, setCheckinNote] = useState('');
  const [checkinMealType, setCheckinMealType] = useState('');
  const [checkinTimeSlot, setCheckinTimeSlot] = useState('');
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [checkinImages, setCheckinImages] = useState([]);

  const [measureModal, setMeasureModal] = useState(null);
  const [measureValues, setMeasureValues] = useState({});
  const [measureOption, setMeasureOption] = useState('');
  const [measureNote, setMeasureNote] = useState('');
  const [measureSaving, setMeasureSaving] = useState(false);
  const [measureImages, setMeasureImages] = useState([]);
  const [weightUnit, setWeightUnit] = useState('kg');

  const [symptomModal, setSymptomModal] = useState(false);
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [symptomNote, setSymptomNote] = useState('');
  const [symptomSaving, setSymptomSaving] = useState(false);
  const [symptomImages, setSymptomImages] = useState([]);
  const [batchModal, setBatchModal] = useState(false);
  const [batchValues, setBatchValues] = useState({ weightUnit: 'kg' });
  const [batchSaving, setBatchSaving] = useState(false);
  const [quickText, setQuickText] = useState('');

  const loadTodayStatus = useCallback(async () => {
    try {
      const [res, calendar] = await Promise.all([recordsAPI.todayStatus(), recordsAPI.checkinCalendar(365)]);
      if (res.success) setDoneTypes(res.doneTypes || {});
      if (calendar.success) setRecordedDates(calendar.data || {});
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
    if (item.measureType) {
      setMeasureValues({});
      setMeasureOption('');
      setMeasureNote('');
      setMeasureImages([]);
      setWeightUnit('kg');
      setCheckinDate(todayStr);
      setMeasureModal(item);
    } else {
      setCheckinNote('');
      setCheckinMealType('');
      setCheckinTimeSlot(item.key === 'exercise' ? '现在' : '');
      setCheckinImages([]);
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
      images: measureImages.map(({ data, mimeType }) => ({ data, mimeType })),
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
      const enteredValue = parseFloat(measureValues.value);
      const normalizedValue = measureType === 'weight' && weightUnit === '斤' ? enteredValue / 2 : enteredValue;
      payload.value = String(Math.round(normalizedValue * 100) / 100);
      if (measureType === 'weight') payload.extra = { enteredValue, enteredUnit: weightUnit };
      const v = normalizedValue;
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
    loadTodayStatus();
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
        value: (mealPrefix + slotPrefix + checkinNote) || checkinMealType || resolvedTimeSlot || '已记录',
        note: '',
        status: 'normal',
        images: checkinImages.map(({ data, mimeType }) => ({ data, mimeType })),
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
    loadTodayStatus();
  };

  const chooseCheckinImage = async () => {
    try {
      const result = await chooseImageWithPrivacy({ count: Math.max(1, 9 - checkinImages.length), sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const next = (result.tempFilePaths || []).map((path) => {
        const base64 = Taro.getFileSystemManager().readFileSync(path, 'base64');
        const ext = (path.split('.').pop() || 'jpg').toLowerCase();
        const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        return { path, mimeType, data: `data:${mimeType};base64,${base64}` };
      });
      setCheckinImages((prev) => [...prev, ...next].slice(0, 9));
    } catch (err) {
      showImagePickerError(err, '图片读取失败，请重试');
    }
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
        images: symptomImages.map(({ data, mimeType }) => ({ data, mimeType })),
        recordedAt: checkinDate === todayStr ? new Date().toISOString() : `${checkinDate}T12:00:00`,
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
    setSymptomImages([]);
    loadTodayStatus();
    if (hasUrgent) {
      Taro.showModal({ title: '建议尽快联系医师', content: '您选择的症状可能需要及时处理，建议立即联系您的健康顾问或健康管理师。', showCancel: false });
    }
  };

  // 像素级对齐app端CheckinScreen.js的renderCheckinItem：3列布局(width:30%)、独立icon方块(36x36/圆角10)
  const renderCheckinItem = (item) => {
    const isDone = isItemDone(item);
    return (
      <View key={item.key} onClick={() => openCheckinModal(item)} style={{
        width: '30%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 4px',
        borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`,
        backgroundColor: isDone ? item.color + '15' : '#fff',
        borderColor: isDone ? item.color + '40' : colors.border,
        boxSizing: 'border-box', gap: '5px',
      }}>
        <View style={{
          width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: isDone ? item.color + '20' : colors.border + '60',
        }}>
          <Icon name={isDone ? '✅' : item.icon} size={18} color={isDone ? item.color : colors.textSecondary} />
        </View>
        <Text style={{ fontSize: '12px', color: isDone ? item.color : colors.textSecondary, fontWeight: isDone ? 700 : 500 }}>{item.label}</Text>
      </View>
    );
  };

  const openSymptomModal = () => {
    setSelectedSymptoms([]);
    setSymptomNote('');
    setSymptomImages([]);
    setCheckinDate(todayStr);
    setSymptomModal(true);
  };

  const chooseImages = async (current, setter) => {
    try {
      const result = await chooseImageWithPrivacy({ count: Math.max(1, 9 - current.length), sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const next = (result.tempFilePaths || []).map((path) => {
        const base64 = Taro.getFileSystemManager().readFileSync(path, 'base64');
        const ext = (path.split('.').pop() || 'jpg').toLowerCase();
        const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        return { path, mimeType, data: `data:${mimeType};base64,${base64}` };
      });
      setter([...current, ...next].slice(0, 9));
    } catch (err) { showImagePickerError(err, '图片读取失败，请重试'); }
  };

  const renderDatePicker = (color = colors.primary) => (
    <View style={{ marginBottom: '14px' }}>
      <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>记录日期</Text>
      <Picker mode="date" value={checkinDate} end={todayStr} onChange={(e) => setCheckinDate(e.detail.value)}>
        <View style={{ border: `1px solid ${color}`, borderRadius: `${radius.sm}px`, padding: '10px 12px' }}><Text style={{ fontSize: '14px', color: colors.textPrimary }}>{checkinDate}　›</Text></View>
      </Picker>
      {(() => {
        const type = measureModal?.measureType || checkinModal?.key || (symptomModal ? 'symptom' : '');
        const dateMap = batchModal
          ? Object.values(recordedDates).reduce((all, dates) => { Object.entries(dates).forEach(([date, amount]) => { all[date] = (all[date] || 0) + amount; }); return all; }, {})
          : (recordedDates[type] || {});
        const count = dateMap[checkinDate] || 0;
        const recent = Object.entries(dateMap).sort(([a], [b]) => b.localeCompare(a)).slice(0, 5);
        return <>
          <Text style={{ display: 'block', marginTop: '6px', fontSize: '12px', color: count ? '#B7791F' : colors.textMuted }}>{count ? `这一天已有 ${count} 条记录，仍可继续补录或修正` : '这一天还没有该项记录'}</Text>
          {!!recent.length && <Text style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: colors.textMuted }}>最近已记录：{recent.map(([date, amount]) => `${date.slice(5)}（${amount}条）`).join('、')}</Text>}
        </>;
      })()}
    </View>
  );

  const renderImagePicker = (images, setter, color = colors.primary) => (
    <View style={{ marginBottom: '14px' }}>
      <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>现场照片（可选）</Text>
      <View onClick={() => chooseImages(images, setter)} style={{ border: `1px dashed ${color}`, borderRadius: `${radius.sm}px`, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {images.length ? <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{images.map((img, index) => <View key={img.path} style={{ position: 'relative' }}><Image src={img.path} mode="aspectFill" style={{ width: '88px', height: '72px', borderRadius: '8px' }} /><Text onClick={(e) => { e.stopPropagation?.(); setter(images.filter((_, i) => i !== index)); }} style={{ position: 'absolute', right: 0, top: 0, color: '#fff', backgroundColor: colors.danger }}>×</Text></View>)}</View> : <Text style={{ color, fontSize: '13px', fontWeight: 600 }}>📷 拍照或从相册选择（最多9张）</Text>}
      </View>
    </View>
  );

  const openBatchModal = () => {
    setCheckinDate(todayStr);
    setBatchValues({ weightUnit: 'kg' });
    setQuickText('');
    setBatchModal(true);
  };

  const updateBatch = (key, value) => setBatchValues((prev) => ({ ...prev, [key]: value }));

  const saveBatch = async () => {
    if (batchSaving) return;
    const at = checkinDate === todayStr ? new Date().toISOString() : `${checkinDate}T12:00:00`;
    const rows = parseQuickHealthText(quickText, checkinDate, todayStr);
    if (rows.unmatchedLines.length) {
      Taro.showToast({ title: `还有${rows.unmatchedLines.length}行未识别，请修改或删除`, icon: 'none', duration: 3000 });
      return;
    }
    [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐']].forEach(([key, mealType]) => {
      const value = String(batchValues[key] || '').trim();
      if (value) rows.push({ category: 'lifestyle', type: 'diet', label: `饮食记录·${mealType}`, value: `【${mealType}】${value}`, extra: { mealType }, recordedAt: at, _inputKeys: [key] });
    });
    [['exercise', '运动'], ['bowel', '排便'], ['water', '饮水'], ['smoking', '吸烟'], ['alcohol', '饮酒']].forEach(([key, label]) => {
      const value = String(batchValues[key] || '').trim();
      if (value) rows.push({ category: 'lifestyle', type: key, label: `${label}记录`, value, recordedAt: at, _inputKeys: [key] });
    });
    const weight = Number(batchValues.weight);
    if (batchValues.weight && (!Number.isFinite(weight) || weight <= 0)) return Taro.showToast({ title: '请核对体重数值', icon: 'none' });
    if (weight > 0) {
      const kg = batchValues.weightUnit === '斤' ? weight / 2 : weight;
      rows.push({ category: 'vitals', type: 'weight', label: '体重记录', unit: 'kg', value: String(Math.round(kg * 100) / 100), extra: { enteredValue: weight, enteredUnit: batchValues.weightUnit }, recordedAt: at, _inputKeys: ['weight'] });
    }
    const sys = Number(batchValues.sys), dia = Number(batchValues.dia);
    if ((batchValues.sys || batchValues.dia) && (!(sys > 0) || !(dia > 0))) return Taro.showToast({ title: '血压需同时填写高压和低压', icon: 'none' });
    if (sys > 0 && dia > 0) rows.push({ category: 'vitals', type: 'bloodPressure', label: '血压记录', unit: 'mmHg', value: `${sys}/${dia}`, extra: { sys, dia }, recordedAt: at, _inputKeys: ['sys', 'dia'] });
    [['heartRate', '心率', '次/分'], ['bloodSugar', '血糖', 'mmol/L'], ['mood', '情绪', '分']].forEach(([key, label, unit]) => {
      const value = String(batchValues[key] || '').trim();
      if (value) rows.push({ category: key === 'mood' ? 'lifestyle' : 'vitals', type: key, label: `${label}记录`, unit, value, recordedAt: at, _inputKeys: [key] });
    });
    if (batchValues.sleepTime && batchValues.wakeTime) rows.push({ category: 'lifestyle', type: 'sleep', label: '睡眠记录', unit: '小时', value: calcSleepDuration(batchValues.sleepTime, batchValues.wakeTime), extra: { sleepTime: batchValues.sleepTime, wakeTime: batchValues.wakeTime }, recordedAt: at, _inputKeys: ['sleepTime', 'wakeTime'] });
    if (!rows.length) return Taro.showToast({ title: '请至少填写一项数据', icon: 'none' });
    setBatchSaving(true);
    const results = await Promise.allSettled(rows.map(({ preview, _sourceLine, _inputKeys, ...row }) => recordsAPI.create(row)));
    setBatchSaving(false);
    const successIndexes = results.map((result, index) => result.status === 'fulfilled' ? index : -1).filter((index) => index >= 0);
    const failedIndexes = results.map((result, index) => result.status === 'rejected' ? index : -1).filter((index) => index >= 0);
    const success = successIndexes.length;
    if (!success) return Taro.showToast({ title: '保存失败，请重试', icon: 'none' });
    await loadTodayStatus();
    if (!failedIndexes.length) {
      setBatchValues({ weightUnit: 'kg' });
      setQuickText('');
      Taro.showToast({ title: `已保存${success}项`, icon: 'success' });
      return;
    }
    const failedQuickLines = failedIndexes.map((index) => rows[index]._sourceLine).filter(Boolean);
    setQuickText([...new Set(failedQuickLines)].join('\n'));
    const successfulInputKeys = successIndexes.flatMap((index) => rows[index]._inputKeys || []);
    setBatchValues((prev) => {
      const next = { ...prev };
      successfulInputKeys.forEach((key) => { delete next[key]; });
      return next;
    });
    const failedLabels = failedIndexes.map((index) => rows[index].label).join('、');
    Taro.showModal({ title: '部分项目未保存', content: `已保存${success}项。未保存：${failedLabels}。页面只保留失败项，可直接重试。`, showCancel: false, confirmText: '知道了' });
  };

  const quickPreview = parseQuickHealthText(quickText, checkinDate, todayStr);

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      {/* 自绘标题栏：对齐app端CheckinScreen.js的topBar（返回按钮+居中标题），
          navigationStyle:custom后需自己适配状态栏高度，避让胶囊按钮 */}
      <View style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`,
        backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`,
      }}>
        <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>今日健康数据</Text>
        <View style={{ width: '28px' }} />
      </View>

      <View style={{ padding: `${spacing.lg}px` }}>
      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
      ) : (
        <>
          {/* 必打卡项 */}
          <View style={{ marginBottom: `${spacing.lg}px` }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
              <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>每日记录</Text>
              <View style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Text onClick={openBatchModal} style={{ fontSize: '13px', fontWeight: 700, color: colors.primary }}>多日快速补录</Text>
                {mandatoryItems.length > 0 && <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.primary }}>{doneMandatoryCount}/{mandatoryItems.length}</Text>}
              </View>
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
              <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>按需记录</Text>
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: `${spacing.sm}px` }}>
                {optionalItems.map(renderCheckinItem)}
              </View>
            </View>
          )}

          {/* 症状自评 */}
          <View style={{ marginBottom: `${spacing.lg}px` }}>
            <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>今天有不适吗？</Text>
            <View onClick={openSymptomModal} style={{
              display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: doneTypes.symptom ? '#FDECEA1A' : '#fff',
              borderRadius: `${radius.md}px`, border: `1px solid ${doneTypes.symptom ? colors.danger + '4D' : colors.border}`, padding: `${spacing.md}px`,
            }}>
              <View style={{
                width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: doneTypes.symptom ? symptomItem.color + '20' : colors.border + '60',
              }}>
                <Icon name={doneTypes.symptom ? '✅' : symptomItem.icon} size={18} color={doneTypes.symptom ? symptomItem.color : colors.textSecondary} />
              </View>
              <Text style={{ flex: 1, fontSize: '13px', color: colors.textSecondary }}>
                {doneTypes.symptom ? '今天已记录不适情况' : '点击选择症状或描述不适（可选）'}
              </Text>
              <Text style={{ fontSize: '13px', color: colors.textMuted }}>›</Text>
            </View>
          </View>
        </>
      )}
      </View>

      {/* 生活方式打卡弹窗 */}
      {checkinModal && (
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: `${spacing.lg}px`, width: '100%', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto' }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>{checkinModal.icon} {checkinModal.label}记录</Text>
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

            <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>{checkinModal.key === 'diet' ? '饮食照片（推荐）' : '记录照片（可选）'}</Text>
            <View onClick={chooseCheckinImage} style={{ border: `1px dashed ${checkinModal.color}`, borderRadius: `${radius.sm}px`, padding: '10px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {checkinImages.length ? <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{checkinImages.map((img, index) => <View key={img.path} style={{ position: 'relative' }}><Image src={img.path} mode="aspectFill" style={{ width: '88px', height: '72px', borderRadius: '8px' }} /><Text onClick={(e) => { e.stopPropagation?.(); setCheckinImages((prev) => prev.filter((_, i) => i !== index)); }} style={{ position: 'absolute', right: 0, top: 0, color: '#fff', backgroundColor: colors.danger }}>×</Text></View>)}</View> : <Text style={{ color: checkinModal.color, fontSize: '13px', fontWeight: 600 }}>📷 拍照或从相册选择（最多9张）</Text>}
            </View>

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
            <Textarea
              style={{
                border: `1.5px solid ${colors.primary}55`, borderRadius: `${radius.sm}px`,
                padding: '10px 12px', fontSize: '14px', color: colors.textPrimary,
                backgroundColor: '#fff', boxSizing: 'border-box', width: '100%',
                height: '96px', lineHeight: '22px',
              }}
              placeholder={`记录今天的${checkinModal.label}情况...`}
              value={checkinNote}
              onInput={(e) => setCheckinNote(e.detail.value)}
              adjustPosition
              cursorSpacing={24}
              maxlength={1000}
            />

            <View style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <View onClick={() => setCheckinModal(null)} style={{ flex: 1, textAlign: 'center', padding: '13px 0', borderRadius: `${radius.md}px`, backgroundColor: colors.border }}>
                <Text style={{ fontSize: '15px', fontWeight: 600, color: colors.textSecondary }}>取消</Text>
              </View>
              <View onClick={checkinSaving ? undefined : saveCheckin} style={{ flex: 2, textAlign: 'center', padding: '13px 0', borderRadius: `${radius.md}px`, backgroundColor: checkinModal.color, opacity: checkinSaving ? 0.6 : 1 }}>
                <Text style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{checkinSaving ? '保存中...' : '保存记录'}</Text>
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
              <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>{measureModal.icon} {measureModal.label}记录</Text>
              <View onClick={() => setMeasureModal(null)}><Text style={{ fontSize: '20px', color: colors.textMuted }}>×</Text></View>
            </View>

            {measureModal.measureType === 'bloodPressure' && <BloodPressurePhoto onSaved={() => { setMeasureModal(null); loadTodayStatus(); }} />}
            {measureModal.measureType === 'bloodSugar' && <BloodSugarPhoto onSaved={() => { setMeasureModal(null); loadTodayStatus(); }} />}
            {measureModal.measureType === 'weight' && <WeightPhoto onSaved={() => { setMeasureModal(null); loadTodayStatus(); }} />}
            {renderDatePicker(measureModal.color)}
            {MEASURE_OPTIONS[measureModal.measureType] && (
              <View style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                {MEASURE_OPTIONS[measureModal.measureType].map((opt) => (
                  <Chip key={opt} label={opt} active={measureOption === opt} color={colors.primary} onClick={() => setMeasureOption(opt)} />
                ))}
              </View>
            )}

            {measureModal.measureType === 'sleep' ? (
              <View>
                {[{ key: 'sleepTime', label: '入睡时间', defaultValue: '22:30' }, { key: 'wakeTime', label: '醒来时间', defaultValue: '06:30' }].map((f) => (
                  <View key={f.key} style={{ marginBottom: '12px' }}>
                    <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>{f.label}</Text>
                    <Picker
                      mode="time"
                      value={measureValues[f.key] || f.defaultValue}
                      onChange={(e) => setMeasureValues((prev) => ({ ...prev, [f.key]: e.detail.value }))}
                    >
                      <View style={{ minHeight: '48px', border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '0 14px', backgroundColor: colors.background, boxSizing: 'border-box', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: '16px', color: measureValues[f.key] ? colors.textPrimary : colors.textMuted }}>
                          {measureValues[f.key] || `请选择${f.label}`}
                        </Text>
                        <Text style={{ fontSize: '18px', color: colors.textMuted }}>›</Text>
                      </View>
                    </Picker>
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
                      adjustPosition
                      cursorSpacing={120}
                    />
                    <Text style={{ fontSize: '12px', color: colors.textMuted }}>{measureModal.measureType === 'weight' ? weightUnit : field.unit}</Text>
                  </View>
                  {measureModal.measureType === 'weight' && <View style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>{['kg', '斤'].map((unit) => <Chip key={unit} label={unit === 'kg' ? 'kg（公斤）' : '斤'} active={weightUnit === unit} color={measureModal.color} onClick={() => setWeightUnit(unit)} />)}{measureValues.value && weightUnit === '斤' ? <Text style={{ fontSize: '13px', color: colors.primary, alignSelf: 'center' }}>＝ {Math.round((Number(measureValues.value) / 2) * 100) / 100} kg</Text> : null}</View>}
                </View>
              ))
            )}

            {!['bloodPressure', 'bloodSugar', 'weight'].includes(measureModal.measureType)
              && renderImagePicker(measureImages, setMeasureImages, measureModal.color)}

            <View style={{ marginBottom: '12px' }}>
              <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>备注（可选，如异常原因）</Text>
              <Textarea
                style={{ border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', fontSize: '14px', backgroundColor: colors.background, boxSizing: 'border-box', width: '100%' }}
                placeholder="如：血压偏高，昨晚熬夜了"
                value={measureNote}
                onInput={(e) => setMeasureNote(e.detail.value)}
                adjustPosition
                cursorSpacing={120}
                maxlength={1000}
                autoHeight
              />
            </View>

            <View style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <View onClick={() => setMeasureModal(null)} style={{ flex: 1, textAlign: 'center', padding: '13px 0', borderRadius: `${radius.md}px`, backgroundColor: colors.border }}>
                <Text style={{ fontSize: '15px', fontWeight: 600, color: colors.textSecondary }}>取消</Text>
              </View>
              <View onClick={measureSaving ? undefined : saveMeasureCheckin} style={{ flex: 2, textAlign: 'center', padding: '13px 0', borderRadius: `${radius.md}px`, backgroundColor: measureModal.color, opacity: measureSaving ? 0.6 : 1 }}>
                <Text style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{measureSaving ? '保存中...' : '保存记录'}</Text>
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

            {renderDatePicker(colors.danger)}

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
            <Textarea
              style={{ border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', fontSize: '14px', backgroundColor: colors.background, boxSizing: 'border-box', width: '100%' }}
              placeholder="描述具体不适情况，如部位、持续时间等"
              value={symptomNote}
              onInput={(e) => setSymptomNote(e.detail.value)}
              fixed
              adjustPosition={false}
              cursorSpacing={12}
              maxlength={1000}
              autoHeight
            />

            {renderImagePicker(symptomImages, setSymptomImages, colors.danger)}

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

      {batchModal && (
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 110, display: 'flex', alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: `${spacing.lg}px`, width: '100%', boxSizing: 'border-box', maxHeight: '92vh', overflowY: 'auto' }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <View><Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>多日快速补录</Text><Text style={{ fontSize: '12px', color: colors.textMuted }}>选择一天，填了哪些就保存哪些</Text></View>
              <Text onClick={() => setBatchModal(false)} style={{ fontSize: '22px', color: colors.textMuted }}>×</Text>
            </View>
            {renderDatePicker(colors.primary)}
            <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>像发消息一样粘贴多日数据</Text>
            <Textarea
              style={{ border: `1.5px solid ${colors.primary}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', fontSize: '14px', color: colors.textPrimary, backgroundColor: '#fff', boxSizing: 'border-box', width: '100%', height: '150px', lineHeight: '23px' }}
              value={quickText}
              placeholder={'例如：\n今日空腹体重：137.8斤\n昨日饮水量：约1200ml\n昨日排便次数：1次\n昨天运动步数：9736步，并做10分钟抗阻训练'}
              onInput={(e) => setQuickText(e.detail.value)}
              maxlength={2000}
            />
            {!!quickText.trim() && <View style={{ marginTop: '8px', marginBottom: '14px', padding: '10px', borderRadius: `${radius.sm}px`, backgroundColor: colors.primary + '10' }}>
              <Text style={{ fontSize: '12px', fontWeight: 700, color: colors.primary, display: 'block', marginBottom: '5px' }}>识别预览（{quickPreview.length}项）</Text>
              {quickPreview.length ? quickPreview.map((row, index) => <Text key={`${row.type}-${index}`} style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '3px' }}>• {row.preview}</Text>) : <Text style={{ fontSize: '12px', color: colors.danger }}>暂未识别，请按示例分行输入，或使用下方按项填写。</Text>}
              {!!quickPreview.unmatchedLines.length && <View style={{ marginTop: '6px' }}><Text style={{ fontSize: '12px', color: colors.danger, fontWeight: 700, display: 'block' }}>以下内容未识别，保存前请修改或删除：</Text>{quickPreview.unmatchedLines.map((line, index) => <Text key={`unmatched-${index}`} style={{ fontSize: '12px', color: colors.danger, display: 'block' }}>• {line}</Text>)}</View>}
            </View>}
            <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', margin: '14px 0 8px' }}>也可以按项填写（备用）</Text>
            <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>饮食（三餐集中填写）</Text>
            {[['breakfast', '早餐吃了什么'], ['lunch', '午餐吃了什么'], ['dinner', '晚餐吃了什么']].map(([key, placeholder]) => <Input key={key} style={{ ...BATCH_INPUT_STYLE, marginBottom: '8px' }} value={batchValues[key] || ''} placeholder={placeholder} onInput={(e) => updateBatch(key, e.detail.value)} />)}
            <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.textSecondary, display: 'block', margin: '14px 0 8px' }}>生活记录</Text>
            {[['exercise', '运动，如：快走30分钟'], ['bowel', '排便，如：正常1次'], ['water', '饮水，如：1500ml'], ['smoking', '吸烟，如：0支'], ['alcohol', '饮酒，如：未饮酒']].map(([key, placeholder]) => <Input key={key} style={{ ...BATCH_INPUT_STYLE, marginBottom: '8px' }} value={batchValues[key] || ''} placeholder={placeholder} onInput={(e) => updateBatch(key, e.detail.value)} />)}
            <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.textSecondary, display: 'block', margin: '14px 0 8px' }}>测量数据</Text>
            <View style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Input type="digit" style={{ ...BATCH_INPUT_STYLE, flex: 1 }} value={batchValues.weight || ''} placeholder="体重" onInput={(e) => updateBatch('weight', e.detail.value)} /><View style={{ display: 'flex', gap: '6px' }}>{['kg', '斤'].map((unit) => <Chip key={unit} label={unit} active={batchValues.weightUnit === unit} color={colors.primary} onClick={() => updateBatch('weightUnit', unit)} />)}</View></View>
            {batchValues.weight && batchValues.weightUnit === '斤' && <Text style={{ color: colors.primary, fontSize: '12px', display: 'block', marginBottom: '8px' }}>自动换算：{Math.round((Number(batchValues.weight) / 2) * 100) / 100} kg</Text>}
            <View style={{ display: 'flex', gap: '8px' }}><Input type="number" style={{ ...BATCH_INPUT_STYLE, flex: 1 }} value={batchValues.sys || ''} placeholder="高压" onInput={(e) => updateBatch('sys', e.detail.value)} /><Input type="number" style={{ ...BATCH_INPUT_STYLE, flex: 1 }} value={batchValues.dia || ''} placeholder="低压" onInput={(e) => updateBatch('dia', e.detail.value)} /></View>
            {[['heartRate', '心率（次/分）'], ['bloodSugar', '血糖（mmol/L）'], ['mood', '情绪评分（1-10）']].map(([key, placeholder]) => <Input key={key} type="digit" style={{ ...BATCH_INPUT_STYLE, marginBottom: '8px' }} value={batchValues[key] || ''} placeholder={placeholder} onInput={(e) => updateBatch(key, e.detail.value)} />)}
            <View style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>{[['sleepTime', '入睡时间'], ['wakeTime', '醒来时间']].map(([key, label]) => <Picker key={key} mode="time" value={batchValues[key] || ''} onChange={(e) => updateBatch(key, e.detail.value)}><View style={{ ...BATCH_INPUT_STYLE, flex: 1, display: 'flex', alignItems: 'center' }}><Text style={{ color: batchValues[key] ? colors.textPrimary : colors.textMuted }}>{batchValues[key] || label}</Text></View></Picker>)}</View>
            <View style={{ display: 'flex', gap: '10px', marginTop: '18px' }}><View onClick={() => setBatchModal(false)} style={{ flex: 1, textAlign: 'center', padding: '13px 0', borderRadius: `${radius.md}px`, backgroundColor: colors.border }}><Text style={{ color: colors.textSecondary, fontWeight: 600 }}>关闭</Text></View><View onClick={batchSaving ? undefined : saveBatch} style={{ flex: 2, textAlign: 'center', padding: '13px 0', borderRadius: `${radius.md}px`, backgroundColor: colors.primary, opacity: batchSaving ? 0.6 : 1 }}><Text style={{ color: '#fff', fontWeight: 700 }}>{batchSaving ? '保存中...' : '保存当天已填项目'}</Text></View></View>
          </View>
        </View>
      )}
    </View>
  );
}
