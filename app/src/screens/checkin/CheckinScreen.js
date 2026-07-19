import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Modal, TextInput, Image, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { recordsAPI } from '../../services/api';

// 本地日期字符串（YYYY-MM-DD）——不能用 toISOString()，那是 UTC 日期
function toLocalDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── 健康更新项目定义（原"打卡项目"，2026-07-19 改造为可折叠工具区）───────
const CHECKIN_DEFS = {
  diet:          { key: 'diet',          label: '饮食', icon: 'nutrition-outline',     measureType: null,            category: 'lifestyle', recordLabel: '饮食记录', allowMultiple: true },
  exercise:      { key: 'exercise',      label: '运动', icon: 'fitness-outline',       measureType: null,            category: 'lifestyle', recordLabel: '运动记录', allowMultiple: true },
  sleep:         { key: 'sleep',         label: '睡眠', icon: 'moon-outline',          measureType: 'sleep',         category: 'lifestyle', recordLabel: '睡眠记录' },
  weight:        { key: 'weight',        label: '体重', icon: 'scale-outline',         measureType: 'weight',        category: 'vitals',    recordLabel: '体重记录' },
  bowel:         { key: 'bowel',         label: '排便', icon: 'leaf-outline',          measureType: null,            category: 'lifestyle', recordLabel: '排便记录' },
  water:         { key: 'water',         label: '饮水', icon: 'water-outline',         measureType: null,            category: 'lifestyle', recordLabel: '饮水记录' },
  smoking:       { key: 'smoking',       label: '吸烟', icon: 'warning-outline',       measureType: null,            category: 'lifestyle', recordLabel: '吸烟记录' },
  alcohol:       { key: 'alcohol',       label: '饮酒', icon: 'wine-outline',          measureType: null,            category: 'lifestyle', recordLabel: '饮酒记录' },
  bloodPressure: { key: 'bloodPressure', label: '血压', icon: 'pulse-outline',         measureType: 'bloodPressure', category: 'vitals',    recordLabel: '血压记录', allowMultiple: true, chronicKeys: ['高血压'] },
  heartRate:     { key: 'heartRate',     label: '心率', icon: 'heart-outline',         measureType: 'heartRate',     category: 'vitals',    recordLabel: '心率记录' },
  bloodSugar:    { key: 'bloodSugar',    label: '血糖', icon: 'water-outline',         measureType: 'bloodSugar',    category: 'vitals',    recordLabel: '血糖记录', allowMultiple: true, chronicKeys: ['糖尿病'] },
  mood:          { key: 'mood',          label: '情绪', icon: 'happy-outline',         measureType: 'mood',          category: 'lifestyle', recordLabel: '情绪记录' },
};

const FIXED_CHECKIN_KEYS = ['diet','exercise','sleep','weight','bowel','water','smoking','alcohol','bloodPressure','heartRate','bloodSugar','mood'];

// 生理指标录入字段定义，与 AddRecordScreen 字段口径保持一致
const MEASURE_FIELDS = {
  bloodPressure: [
    { key: 'sys', label: '收缩压', unit: 'mmHg', placeholder: '如：130', normal: '90-139' },
    { key: 'dia', label: '舒张压', unit: 'mmHg', placeholder: '如：80', normal: '60-89' },
  ],
  bloodSugar: [
    { key: 'value', label: '血糖值', unit: 'mmol/L', placeholder: '如：6.1', normal: '3.9-6.1' },
  ],
  heartRate: [
    { key: 'value', label: '心率', unit: '次/分', placeholder: '如：72', normal: '60-100' },
  ],
  weight: [
    { key: 'value', label: '体重', unit: 'kg', placeholder: '如：70.5', normal: '视BMI而定' },
  ],
  mood: [
    { key: 'value', label: '情绪评分', unit: '分', placeholder: '1-10分', normal: '6-10' },
  ],
  sleep: [],
};
const MEASURE_OPTIONS = { bloodSugar: ['空腹', '餐后2小时', '睡前', '随机'], bloodPressure: ['左臂', '右臂'] };

// 运动记录时段选项
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

// ── 板块①「今日建议完成」：按慢病标签的简单规则映射清单，本轮不接AI，
// 医护端后续可在此基础上加手工调整入口。默认清单保证任何用户都至少有基础项。
const SUGGESTION_RULES = [
  { chronicKey: '高血压', text: '测量一次血压', icon: 'pulse-outline' },
  { chronicKey: '糖尿病', text: '记录一次血糖', icon: 'water-outline' },
  { chronicKey: '冠心病', text: '记录一次心率', icon: 'heart-outline' },
  { chronicKey: '高脂血症', text: '今天少吃油腻食物', icon: 'nutrition-outline' },
];
const DEFAULT_SUGGESTIONS = [
  { text: '记录今天的饮食情况', icon: 'nutrition-outline' },
  { text: '完成30分钟活动量', icon: 'fitness-outline' },
  { text: '保证7-8小时睡眠', icon: 'moon-outline' },
];

function buildTodaySuggestions(chronicDiseases = []) {
  const matched = SUGGESTION_RULES.filter(r => chronicDiseases.includes(r.chronicKey));
  const list = matched.length > 0 ? matched : DEFAULT_SUGGESTIONS;
  return list.map((s, i) => ({ id: `sug_${i}`, text: s.text, icon: s.icon }));
}

// ── 板块③「今日变化」配置 ──────────────────────────────────────────
const MOOD_OPTIONS = [
  { key: 'good',    emoji: '😊', label: '今天状态很好' },
  { key: 'neutral', emoji: '😐', label: '没什么变化' },
  { key: 'concern',  emoji: '😷', label: '有新的情况' },
];
const SYMPTOM_OPTIONS = ['头晕', '乏力', '心悸', '腹泻', '恶心', '失眠', '关节疼痛', '皮疹'];
const URGENT_SYMPTOMS = ['胸痛', '呼吸困难'];
const ALL_SYMPTOM_OPTIONS = [...SYMPTOM_OPTIONS, ...URGENT_SYMPTOMS];

export default function CheckinScreen({ navigation }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [doneTypes, setDoneTypes] = useState({}); // { type: { note, hasImage } }，来自后端今日记录状态

  const todayStr = toLocalDateStr(new Date());
  const [checkinDate, setCheckinDate] = useState(todayStr);

  // 板块①：今日建议完成清单（本地勾选状态，不强制写库，只是给用户的行动清单）
  const chronicDiseases = user?.chronicDiseases || [];
  const [suggestions] = useState(() => buildTodaySuggestions(chronicDiseases));
  const [suggestionDone, setSuggestionDone] = useState({});

  // 板块②：健康更新——默认折叠
  const [updateExpanded, setUpdateExpanded] = useState(false);

  // 板块③：今日变化
  const [selectedMood, setSelectedMood] = useState(null);
  const [concernModal, setConcernModal] = useState(false);
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [concernNote, setConcernNote] = useState('');
  const [concernImage, setConcernImage] = useState(null);
  const [concernSaving, setConcernSaving] = useState(false);
  const [moodSubmitted, setMoodSubmitted] = useState(false);

  const [checkinModal, setCheckinModal] = useState(null);
  const [checkinNote, setCheckinNote] = useState('');
  const [checkinImage, setCheckinImage] = useState(null);
  const [checkinMealType, setCheckinMealType] = useState('');
  const [checkinTimeSlot, setCheckinTimeSlot] = useState('');
  const [checkinSaving, setCheckinSaving] = useState(false);

  const [measureModal, setMeasureModal] = useState(null);
  const [measureValues, setMeasureValues] = useState({});
  const [measureOption, setMeasureOption] = useState('');
  const [measureNote, setMeasureNote] = useState('');
  const [measureSaving, setMeasureSaving] = useState(false);

  const loadTodayStatus = useCallback(async () => {
    try {
      const res = await recordsAPI.todayStatus();
      if (res.success) setDoneTypes(res.doneTypes || {});
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTodayStatus(); }, [loadTodayStatus]);

  const isMandatory = (item) => {
    if (!item.chronicKeys) return true;
    return item.chronicKeys.some(k => chronicDiseases.includes(k));
  };
  const mandatoryItems = FIXED_CHECKIN_KEYS.map(k => CHECKIN_DEFS[k]).filter(isMandatory);
  const optionalItems  = FIXED_CHECKIN_KEYS.map(k => CHECKIN_DEFS[k]).filter(item => !isMandatory(item));

  const isItemDone = (item) => !!doneTypes[item.key] || (item.measureType && !!doneTypes[item.measureType]);

  const openCheckinModal = (item) => {
    if (isItemDone(item) && !item.allowMultiple) {
      Alert.alert('今日已记录', '这一项今天已经记录过了，明天再来吧～');
      return;
    }
    if (item.measureType) {
      setMeasureValues({});
      setMeasureOption('');
      setMeasureNote('');
      setMeasureModal(item);
    } else {
      setCheckinNote('');
      setCheckinImage(null);
      setCheckinMealType('');
      setCheckinTimeSlot(item.key === 'exercise' ? '现在' : '');
      setCheckinSaving(false);
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
      : fields.every(f => measureValues[f.key]);
    if (!hasValue) {
      Alert.alert('请填写完整', measureType === 'sleep' ? '请填写入睡时间和醒来时间' : '请填写完整数值');
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
      Alert.alert('保存失败', err.message || '网络异常，请重试');
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
      Alert.alert('请选择餐次', '这次记录的是早餐、午餐、晚餐还是加餐？');
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
        imageUrl: checkinImage || '',
        extra: {
          ...(checkinImage ? { imageUrl: checkinImage } : {}),
          ...(checkinMealType ? { mealType: checkinMealType } : {}),
          ...(resolvedTimeSlot ? { timeSlot: resolvedTimeSlot } : {}),
        },
        recordedAt: isToday ? new Date().toISOString() : `${checkinDate}T12:00:00`,
      });
    } catch (err) {
      setCheckinSaving(false);
      Alert.alert('保存失败', err.message || '网络异常，请重试');
      return;
    }
    setCheckinSaving(false);
    setCheckinModal(null);
    if (isToday) loadTodayStatus();
  };

  const toggleSymptom = (s) => {
    setSelectedSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const toggleSuggestion = (id) => {
    setSuggestionDone(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectMood = (key) => {
    setSelectedMood(key);
    if (key === 'concern') {
      setConcernModal(true);
    } else {
      // 状态良好/没什么变化：直接记为今日情绪反馈，不需要额外表单
      recordsAPI.create({
        category: 'lifestyle',
        type: 'mood',
        label: '今日状态反馈',
        value: MOOD_OPTIONS.find(m => m.key === key)?.label || '',
        note: '',
        status: 'normal',
        recordedAt: new Date().toISOString(),
      }).catch(() => {});
      setMoodSubmitted(true);
    }
  };

  const submitConcern = async () => {
    if (concernSaving) return;
    if (selectedSymptoms.length === 0 && !concernNote.trim()) {
      Alert.alert('请选择或填写情况', '至少选择一项常见症状，或在下方描述具体情况');
      return;
    }
    const hasUrgent = selectedSymptoms.some(s => URGENT_SYMPTOMS.includes(s));
    setConcernSaving(true);
    try {
      await recordsAPI.create({
        category: 'vitals',
        type: 'symptom',
        label: '今日变化反馈',
        value: selectedSymptoms.join('、') || '其他情况',
        note: concernNote,
        status: hasUrgent ? 'danger' : 'normal',
        imageUrl: concernImage || '',
        extra: { symptoms: selectedSymptoms, ...(concernImage ? { imageUrl: concernImage } : {}) },
        recordedAt: new Date().toISOString(),
      });
    } catch (err) {
      setConcernSaving(false);
      Alert.alert('提交失败', err.message || '网络异常，请重试');
      return;
    }
    setConcernSaving(false);
    setConcernModal(false);
    setSelectedSymptoms([]);
    setConcernNote('');
    setConcernImage(null);
    setMoodSubmitted(true);
    loadTodayStatus();
    if (hasUrgent) {
      Alert.alert('建议尽快联系医师', '您选择的情况可能需要及时处理，建议立即联系您的家庭医生或健康管理师。');
    } else {
      Alert.alert('已提交', '您的健康团队会尽快查看，感谢您的反馈');
    }
  };

  const renderCheckinItem = (item) => {
    const isDone = isItemDone(item);
    const hasNote = !!doneTypes[item.key]?.note || !!doneTypes[item.key]?.hasImage;
    return (
      <TouchableOpacity
        key={item.key}
        style={[styles.toolItem, isDone && styles.toolItemDone]}
        onPress={() => openCheckinModal(item)}
        activeOpacity={0.75}
      >
        <View style={[styles.toolIconWrap, isDone && styles.toolIconWrapDone]}>
          <Ionicons name={isDone ? 'checkmark-circle' : item.icon} size={16}
            color={isDone ? colors.primary : colors.textMuted} />
        </View>
        <Text style={[styles.toolItemLabel, isDone && { color: colors.primary }]}>
          {item.label}
        </Text>
        {hasNote && !item.measureType && (
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary, position: 'absolute', top: 6, right: 6 }} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>今日健康计划</Text>
        <View style={{ width: 30 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg }} showsVerticalScrollIndicator={false}>

          {/* ── 板块① 今日建议完成 ──────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>今日建议完成</Text>
            <View style={styles.suggestionCard}>
              {suggestions.map((s, i) => {
                const done = !!suggestionDone[s.id];
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.suggestionRow, i < suggestions.length - 1 && styles.suggestionRowBorder]}
                    onPress={() => toggleSuggestion(s.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.suggestionCheck, done && styles.suggestionCheckDone]}>
                      {done && <Ionicons name="checkmark" size={13} color={colors.background} />}
                    </View>
                    <Ionicons name={s.icon} size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                    <Text style={[styles.suggestionText, done && styles.suggestionTextDone]}>{s.text}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── 板块② 健康更新（可折叠，视觉收小，统一为工具区颜色）───────── */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.updateHeader}
              onPress={() => setUpdateExpanded(v => !v)}
              activeOpacity={0.7}
            >
              <View>
                <Text style={styles.sectionTitle}>健康更新</Text>
                <Text style={styles.updateSubtitle}>今天如果有变化，可以补充</Text>
              </View>
              <Ionicons name={updateExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {updateExpanded && (
              <View style={styles.updateBody}>
                <View style={styles.toolGrid}>
                  {[...mandatoryItems, ...optionalItems].map(renderCheckinItem)}
                </View>
              </View>
            )}
          </View>

          {/* ── 板块③ 今日变化 ──────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>今日变化</Text>
            <Text style={styles.updateSubtitle}>今天需要告诉健康团队什么？</Text>
            <View style={styles.moodRow}>
              {MOOD_OPTIONS.map(m => {
                const active = selectedMood === m.key;
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.moodItem, active && styles.moodItemActive]}
                    onPress={() => selectMood(m.key)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.moodEmoji}>{m.emoji}</Text>
                    <Text style={[styles.moodLabel, active && styles.moodLabelActive]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {moodSubmitted && selectedMood !== 'concern' && (
              <View style={styles.moodConfirm}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={styles.moodConfirmText}>已记录今日状态，感谢反馈</Text>
              </View>
            )}
          </View>

        </ScrollView>
      )}

      {/* 「有新的情况」弹窗：症状/照片/语音/文字 + 联系健康团队 */}
      <Modal visible={concernModal} transparent animationType="slide" onRequestClose={() => setConcernModal(false)}>
        <View style={styles.checkinModalOverlay}>
          <View style={styles.checkinModalBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>有新的情况</Text>
              <TouchableOpacity onPress={() => setConcernModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>症状</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {ALL_SYMPTOM_OPTIONS.map(s => {
                const active = selectedSymptoms.includes(s);
                const urgent = URGENT_SYMPTOMS.includes(s);
                return (
                  <TouchableOpacity key={s} onPress={() => toggleSymptom(s)}
                    style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8,
                      backgroundColor: active ? (urgent ? colors.danger : colors.primary) : colors.glass,
                      borderWidth: 1, borderColor: active ? (urgent ? colors.danger : colors.primary) : colors.glassBorder }}>
                    <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? colors.background : colors.textSecondary }}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>照片（可选）</Text>
            <TouchableOpacity
              style={styles.checkinImageBtn}
              onPress={() => {
                if (Platform.OS === 'web') {
                  const input = document.createElement('input');
                  input.type = 'file'; input.accept = 'image/*';
                  input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => setConcernImage(ev.target.result);
                    reader.readAsDataURL(file);
                  };
                  input.click();
                }
              }}
            >
              {concernImage ? (
                <Image source={{ uri: concernImage }} style={{ width: '100%', height: 120, borderRadius: 8 }} resizeMode="cover" />
              ) : (
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Ionicons name="camera-outline" size={26} color={colors.textMuted} />
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>点击上传照片</Text>
                </View>
              )}
            </TouchableOpacity>
            {concernImage && (
              <TouchableOpacity onPress={() => setConcernImage(null)} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: colors.danger }}>删除照片</Text>
              </TouchableOpacity>
            )}

            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6, marginTop: 14 }}>语音 / 文字</Text>
            <TouchableOpacity
              style={[styles.checkinImageBtn, { minHeight: 48, flexDirection: 'row', justifyContent: 'center', gap: 6 }]}
              onPress={() => Alert.alert('语音记录', '语音输入功能即将上线，目前可先用下方文字描述')}
            >
              <Ionicons name="mic-outline" size={18} color={colors.textMuted} />
              <Text style={{ fontSize: 13, color: colors.textMuted }}>按住说话（即将上线）</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.checkinNoteInput, { marginTop: 10 }]}
              multiline
              numberOfLines={3}
              placeholder="用文字描述具体情况，如部位、持续时间等"
              placeholderTextColor={colors.textMuted}
              value={concernNote}
              onChangeText={setConcernNote}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder }]} onPress={() => setConcernModal(false)} disabled={concernSaving}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: colors.primary, flex: 2, opacity: concernSaving ? 0.6 : 1 }]} onPress={submitConcern} disabled={concernSaving}>
                {concernSaving ? <ActivityIndicator size="small" color={colors.background} /> : <Ionicons name="send" size={16} color={colors.background} />}
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.background, marginLeft: 4 }}>{concernSaving ? '提交中...' : '联系健康团队'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 健康更新记录弹窗（仅用于生活方式类项目） */}
      <Modal visible={!!checkinModal} transparent animationType="slide" onRequestClose={() => setCheckinModal(null)}>
        <View style={styles.checkinModalOverlay}>
          <View style={styles.checkinModalBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {checkinModal && <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary10, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={checkinModal.icon} size={18} color={colors.primary} />
                </View>}
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>{checkinModal?.label}记录</Text>
              </View>
              <TouchableOpacity onPress={() => setCheckinModal(null)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>这是哪一天的情况</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              {[
                { label: '今天', d: 0 },
                { label: '昨天', d: 1 },
                { label: '前天', d: 2 },
              ].map(({ label, d }) => {
                const dt = new Date(); dt.setDate(dt.getDate() - d);
                const ds = toLocalDateStr(dt);
                const active = checkinDate === ds;
                return (
                  <TouchableOpacity key={label} onPress={() => setCheckinDate(ds)}
                    style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8,
                      backgroundColor: active ? colors.primary : colors.glass,
                      borderWidth: 1, borderColor: active ? colors.primary : colors.glassBorder }}>
                    <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? colors.background : colors.textSecondary }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {Platform.OS === 'web' ? (
              <input type="date" value={checkinDate} max={todayStr}
                onChange={(e) => e.target.value && setCheckinDate(e.target.value)}
                style={{ marginBottom: 14, padding: '7px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 14, color: colors.textPrimary, background: colors.surface, width: '60%' }} />
            ) : (
              <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 14 }}>当前记录归属：{checkinDate}</Text>
            )}

            {checkinModal?.key === 'diet' && (
              <>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>这是哪一餐</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  {['早餐', '午餐', '晚餐', '加餐'].map(mt => {
                    const active = checkinMealType === mt;
                    return (
                      <TouchableOpacity key={mt} onPress={() => setCheckinMealType(mt)}
                        style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8,
                          backgroundColor: active ? colors.primary : colors.glass,
                          borderWidth: 1, borderColor: active ? colors.primary : colors.glassBorder }}>
                        <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? colors.background : colors.textSecondary }}>{mt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {checkinModal?.key === 'exercise' && (
              <>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>运动时段（可选）</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  {['现在', ...EXERCISE_TIME_SLOTS].map(slot => {
                    const active = checkinTimeSlot === slot;
                    return (
                      <TouchableOpacity key={slot} onPress={() => setCheckinTimeSlot(slot)}
                        style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8,
                          backgroundColor: active ? colors.primary : colors.glass,
                          borderWidth: 1, borderColor: active ? colors.primary : colors.glassBorder }}>
                        <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? colors.background : colors.textSecondary }}>{slot}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>记录内容（可选）</Text>
            <TextInput
              style={styles.checkinNoteInput}
              multiline
              numberOfLines={3}
              placeholder={`记录今天的${checkinModal?.label}情况...`}
              placeholderTextColor={colors.textMuted}
              value={checkinNote}
              onChangeText={setCheckinNote}
            />
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 8, marginTop: 12 }}>上传图片（可选）</Text>
            <TouchableOpacity
              style={styles.checkinImageBtn}
              onPress={() => {
                if (Platform.OS === 'web') {
                  const input = document.createElement('input');
                  input.type = 'file'; input.accept = 'image/*';
                  input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => setCheckinImage(ev.target.result);
                    reader.readAsDataURL(file);
                  };
                  input.click();
                }
              }}
            >
              {checkinImage ? (
                <Image source={{ uri: checkinImage }} style={{ width: '100%', height: 120, borderRadius: 8 }} resizeMode="cover" />
              ) : (
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>点击上传图片</Text>
                </View>
              )}
            </TouchableOpacity>
            {checkinImage && (
              <TouchableOpacity onPress={() => setCheckinImage(null)} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: colors.danger }}>删除图片</Text>
              </TouchableOpacity>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder }]} onPress={() => setCheckinModal(null)} disabled={checkinSaving}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: colors.primary, flex: 2, opacity: checkinSaving ? 0.6 : 1 }]} onPress={saveCheckin} disabled={checkinSaving}>
                {checkinSaving ? <ActivityIndicator size="small" color={colors.background} /> : <Ionicons name="checkmark" size={18} color={colors.background} />}
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.background, marginLeft: 4 }}>{checkinSaving ? '保存中...' : '完成记录'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 生理指标记录弹窗（血压/体重/睡眠/心率/血糖），原地填写，独立提交 */}
      <Modal visible={!!measureModal} transparent animationType="slide" onRequestClose={() => setMeasureModal(null)}>
        <View style={styles.checkinModalOverlay}>
          <View style={styles.checkinModalBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {measureModal && <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary10, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={measureModal.icon} size={18} color={colors.primary} />
                </View>}
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>{measureModal?.label}记录</Text>
              </View>
              <TouchableOpacity onPress={() => setMeasureModal(null)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {measureModal && MEASURE_OPTIONS[measureModal.measureType] && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {MEASURE_OPTIONS[measureModal.measureType].map(opt => {
                  const active = measureOption === opt;
                  return (
                    <TouchableOpacity key={opt} onPress={() => setMeasureOption(opt)}
                      style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8,
                        backgroundColor: active ? colors.primary : colors.glass,
                        borderWidth: 1, borderColor: active ? colors.primary : colors.glassBorder }}>
                      <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? colors.background : colors.textSecondary }}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {measureModal && measureModal.measureType === 'sleep' ? (
              <View>
                {[
                  { key: 'sleepTime', label: '入睡时间', placeholder: '如：22:30' },
                  { key: 'wakeTime',  label: '醒来时间', placeholder: '如：06:30' },
                ].map(f => (
                  <View key={f.key} style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>{f.label}</Text>
                    <TextInput
                      style={styles.checkinNoteInput}
                      placeholder={f.placeholder}
                      placeholderTextColor={colors.textMuted}
                      value={measureValues[f.key] || ''}
                      onChangeText={v => setMeasureValues(prev => ({ ...prev, [f.key]: v }))}
                    />
                  </View>
                ))}
                {measureValues.sleepTime && measureValues.wakeTime ? (
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>
                    睡眠时长：<Text style={{ fontWeight: '700', color: colors.primary }}>{calcSleepDuration(measureValues.sleepTime, measureValues.wakeTime)} 小时</Text>
                  </Text>
                ) : null}
              </View>
            ) : (
              measureModal && (MEASURE_FIELDS[measureModal.measureType] || []).map(field => (
                <View key={field.key} style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 2 }}>{field.label}（正常值：{field.normal}）</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2 }}>
                    <TextInput
                      style={{ flex: 1, fontSize: 20, fontWeight: '700', color: colors.textPrimary }}
                      placeholder={field.placeholder}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={measureValues[field.key] || ''}
                      onChangeText={v => setMeasureValues(prev => ({ ...prev, [field.key]: v }))}
                    />
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>{field.unit}</Text>
                  </View>
                </View>
              ))
            )}

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>备注（可选，如异常原因）</Text>
              <TextInput
                style={styles.checkinNoteInput}
                placeholder="如：血压偏高，昨晚熬夜了"
                placeholderTextColor={colors.textMuted}
                value={measureNote}
                onChangeText={setMeasureNote}
                multiline
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder }]} onPress={() => setMeasureModal(null)} disabled={measureSaving}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: colors.primary, flex: 2, opacity: measureSaving ? 0.6 : 1 }]} onPress={saveMeasureCheckin} disabled={measureSaving}>
                {measureSaving ? <ActivityIndicator size="small" color={colors.background} /> : <Ionicons name="checkmark" size={18} color={colors.background} />}
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.background, marginLeft: 4 }}>{measureSaving ? '保存中...' : '完成记录'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  backBtn: { padding: 4 },
  pageTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },

  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },

  // 板块①：今日建议完成
  suggestionCard: {
    backgroundColor: colors.glass, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.glassBorder,
    marginTop: spacing.sm, overflow: 'hidden',
  },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: spacing.md },
  suggestionRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  suggestionCheck: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: colors.glassBorder,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  suggestionCheckDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  suggestionText: { flex: 1, fontSize: 14, color: colors.textPrimary },
  suggestionTextDone: { color: colors.textMuted, textDecorationLine: 'line-through' },

  // 板块②：健康更新（折叠工具区，颜色统一、视觉收小）
  updateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  updateSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  updateBody: { marginTop: spacing.sm },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  toolItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
  },
  toolItemDone: { borderColor: colors.primary },
  toolIconWrap: { marginRight: 5 },
  toolIconWrapDone: {},
  toolItemLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },

  // 板块③：今日变化
  moodRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  moodItem: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.glassBorder,
    backgroundColor: colors.glass, gap: 6,
  },
  moodItemActive: { borderColor: colors.primary, backgroundColor: colors.primary10 },
  moodEmoji: { fontSize: 24 },
  moodLabel: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
  moodLabelActive: { color: colors.primary, fontWeight: '600' },
  moodConfirm: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
  moodConfirmText: { fontSize: 12, color: colors.textMuted },

  checkinModalOverlay: {
    flex: 1, backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  checkinModalBox: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: colors.glassBorder,
    padding: spacing.lg, paddingBottom: 36,
  },
  checkinNoteInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: 12, fontSize: 14, color: colors.textPrimary,
    minHeight: 80, textAlignVertical: 'top', backgroundColor: colors.background,
  },
  checkinImageBtn: {
    borderWidth: 1.5, borderColor: colors.glassBorder, borderRadius: radius.sm,
    borderStyle: 'dashed', minHeight: 80, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background, overflow: 'hidden',
  },
  checkinModalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: radius.md, flex: 1,
  },
});
