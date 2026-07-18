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

// ── 打卡项目定义（从 HomeScreen 抽离，2026-07-18 打卡页重构）───────
const CHECKIN_DEFS = {
  diet:          { key: 'diet',          label: '饮食', icon: 'nutrition-outline',     color: '#059669', measureType: null,            category: 'lifestyle', recordLabel: '饮食打卡', allowMultiple: true },
  exercise:      { key: 'exercise',      label: '运动', icon: 'fitness-outline',       color: '#0369A1', measureType: null,            category: 'lifestyle', recordLabel: '运动打卡', allowMultiple: true },
  sleep:         { key: 'sleep',         label: '睡眠', icon: 'moon-outline',          color: '#4F46E5', measureType: 'sleep',         category: 'lifestyle', recordLabel: '睡眠打卡' },
  weight:        { key: 'weight',        label: '体重', icon: 'scale-outline',         color: '#059669', measureType: 'weight',        category: 'vitals',    recordLabel: '体重打卡' },
  bowel:         { key: 'bowel',         label: '排便', icon: 'leaf-outline',          color: '#92400E', measureType: null,            category: 'lifestyle', recordLabel: '排便打卡' },
  water:         { key: 'water',         label: '饮水', icon: 'water-outline',         color: '#0EA5E9', measureType: null,            category: 'lifestyle', recordLabel: '饮水打卡' },
  smoking:       { key: 'smoking',       label: '吸烟', icon: 'warning-outline',       color: '#6B7280', measureType: null,            category: 'lifestyle', recordLabel: '吸烟记录' },
  alcohol:       { key: 'alcohol',       label: '饮酒', icon: 'wine-outline',          color: '#9D174D', measureType: null,            category: 'lifestyle', recordLabel: '饮酒记录' },
  bloodPressure: { key: 'bloodPressure', label: '血压', icon: 'pulse-outline',         color: '#DC3545', measureType: 'bloodPressure', category: 'vitals',    recordLabel: '血压打卡', allowMultiple: true, chronicKeys: ['高血压'] },
  heartRate:     { key: 'heartRate',     label: '心率', icon: 'heart-outline',         color: '#DC3545', measureType: 'heartRate',     category: 'vitals',    recordLabel: '心率打卡' },
  bloodSugar:    { key: 'bloodSugar',    label: '血糖', icon: 'water-outline',         color: '#F39C12', measureType: 'bloodSugar',    category: 'vitals',    recordLabel: '血糖打卡', allowMultiple: true, chronicKeys: ['糖尿病'] },
  mood:          { key: 'mood',          label: '情绪', icon: 'happy-outline',         color: '#7C3AED', measureType: 'mood',          category: 'lifestyle', recordLabel: '情绪打卡' },
  symptom:       { key: 'symptom',       label: '不适', icon: 'medkit-outline',        color: '#DC2626', measureType: 'symptom',       category: 'vitals',    recordLabel: '症状自评', optional: true },
};

// 12项固定打卡 + 症状自评（症状自评始终可选，不受慢病标签影响）
const FIXED_CHECKIN_KEYS = ['diet','exercise','sleep','weight','bowel','water','smoking','alcohol','bloodPressure','heartRate','bloodSugar','mood'];

// 生理指标打卡项的字段定义，与 AddRecordScreen 字段口径保持一致
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

// 常见症状多选项（症状自评专用）
const SYMPTOM_OPTIONS = ['头晕', '乏力', '心悸', '腹泻', '恶心', '失眠', '关节疼痛', '皮疹'];
// 需紧急处理的症状：选中后提示联系医师，不阻断提交
const URGENT_SYMPTOMS = ['胸痛', '呼吸困难'];
const ALL_SYMPTOM_OPTIONS = [...SYMPTOM_OPTIONS, ...URGENT_SYMPTOMS];

// 运动打卡时段选项："现在"表示按当前时刻自动换算，用于即时打卡；其余为补录过去记录时手动选择
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

export default function CheckinScreen({ navigation }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [doneTypes, setDoneTypes] = useState({}); // { type: { note, hasImage } }，来自后端今日打卡状态

  const todayStr = toLocalDateStr(new Date());
  const [checkinDate, setCheckinDate] = useState(todayStr);

  const [checkinModal, setCheckinModal] = useState(null);
  const [checkinNote, setCheckinNote] = useState('');
  const [checkinImage, setCheckinImage] = useState(null);
  const [checkinMealType, setCheckinMealType] = useState('');
  const [checkinTimeSlot, setCheckinTimeSlot] = useState(''); // 运动打卡专用：时段（早上/上午/中午/下午/晚上），"现在"表示按当前时刻自动换算
  const [checkinSaving, setCheckinSaving] = useState(false);

  const [measureModal, setMeasureModal] = useState(null);
  const [measureValues, setMeasureValues] = useState({});
  const [measureOption, setMeasureOption] = useState('');
  const [measureNote, setMeasureNote] = useState('');
  const [measureSaving, setMeasureSaving] = useState(false);

  // 症状自评弹窗
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

  useEffect(() => { loadTodayStatus(); }, [loadTodayStatus]);

  // 根据用户慢病标签，决定血压/血糖是否为必打卡项；无对应慢病则归为可选，不做"未完成"提示
  const chronicDiseases = user?.chronicDiseases || [];
  const isMandatory = (item) => {
    if (item.optional) return false;
    if (!item.chronicKeys) return true;
    return item.chronicKeys.some(k => chronicDiseases.includes(k));
  };

  const mandatoryItems = FIXED_CHECKIN_KEYS.map(k => CHECKIN_DEFS[k]).filter(isMandatory);
  const optionalItems  = FIXED_CHECKIN_KEYS.map(k => CHECKIN_DEFS[k]).filter(item => !isMandatory(item));
  const symptomItem = CHECKIN_DEFS.symptom;

  const isItemDone = (item) => !!doneTypes[item.key] || (item.measureType && !!doneTypes[item.measureType]);
  const doneMandatoryCount = mandatoryItems.filter(isItemDone).length;
  const allMandatoryDone = mandatoryItems.length > 0 && doneMandatoryCount === mandatoryItems.length;

  const openCheckinModal = (item) => {
    if (isItemDone(item) && !item.allowMultiple) {
      Alert.alert('今日已打卡', '这一项今天已经打过卡了，明天再来吧～');
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
      // 打开即默认"现在"，即时打卡不用手动选时段；补录过去日期时用户会再手动改选
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
    // 运动打卡时段：选"现在"按当前时刻自动换算；未选时段的补录记录，不强制要求（时段是辅助信息，不阻断打卡）
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

  const saveSymptom = async () => {
    if (symptomSaving) return;
    if (selectedSymptoms.length === 0 && !symptomNote.trim()) {
      Alert.alert('请选择或填写症状', '至少选择一项常见症状，或在下方描述具体不适');
      return;
    }
    const hasUrgent = selectedSymptoms.some(s => URGENT_SYMPTOMS.includes(s));
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
      Alert.alert('保存失败', err.message || '网络异常，请重试');
      return;
    }
    setSymptomSaving(false);
    setSymptomModal(false);
    setSelectedSymptoms([]);
    setSymptomNote('');
    loadTodayStatus();
    if (hasUrgent) {
      Alert.alert('建议尽快联系医师', '您选择的症状可能需要及时处理，建议立即联系您的家庭医生或健康管理师。');
    }
  };

  const renderCheckinItem = (item) => {
    const isDone = isItemDone(item);
    const hasNote = !!doneTypes[item.key]?.note || !!doneTypes[item.key]?.hasImage;
    return (
      <TouchableOpacity
        key={item.key}
        style={[styles.checkinItem, isDone && { backgroundColor: item.color + '15', borderColor: item.color + '40' }]}
        onPress={() => openCheckinModal(item)}
        activeOpacity={0.75}
      >
        <View style={[styles.checkinIconWrap, { backgroundColor: isDone ? item.color + '20' : colors.border + '60' }]}>
          <Ionicons name={isDone ? 'checkmark-circle' : item.icon} size={20}
            color={isDone ? item.color : colors.textMuted} />
        </View>
        <Text style={[styles.checkinItemLabel, isDone && { color: item.color, fontWeight: '700' }]}>
          {item.label}
        </Text>
        {item.measureType && !isDone && (
          <View style={{ position: 'absolute', bottom: 4, right: 4 }}>
            <Ionicons name="add-circle-outline" size={12} color={item.color} />
          </View>
        )}
        {hasNote && !item.measureType && (
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: item.color, position: 'absolute', top: 6, right: 6 }} />
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
        <Text style={styles.pageTitle}>今日健康打卡</Text>
        <View style={{ width: 30 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg }} showsVerticalScrollIndicator={false}>
          {/* 必打卡项 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>必打卡项</Text>
              {mandatoryItems.length > 0 && (
                <Text style={styles.sectionProgress}>{doneMandatoryCount}/{mandatoryItems.length}</Text>
              )}
            </View>
            <View style={styles.checkinGrid}>
              {mandatoryItems.map(renderCheckinItem)}
            </View>
            {allMandatoryDone && (
              <View style={styles.checkinAllDone}>
                <Ionicons name="star" size={14} color="#F39C12" />
                <Text style={styles.checkinAllDoneText}>今日核心指标已完成！保持健康好习惯 🎉</Text>
              </View>
            )}
          </View>

          {/* 可选打卡项：不做则不提示"未完成"，避免打卡疲劳 */}
          {optionalItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>可选打卡项</Text>
              <View style={styles.checkinGrid}>
                {optionalItems.map(renderCheckinItem)}
              </View>
            </View>
          )}

          {/* 今天有不适吗？—— 症状自评，2026-07-18 新增 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>今天有不适吗？</Text>
            <TouchableOpacity
              style={[styles.symptomEntry, doneTypes.symptom && styles.symptomEntryDone]}
              onPress={() => setSymptomModal(true)}
              activeOpacity={0.75}
            >
              <View style={[styles.checkinIconWrap, { backgroundColor: doneTypes.symptom ? symptomItem.color + '20' : colors.border + '60' }]}>
                <Ionicons name={doneTypes.symptom ? 'checkmark-circle' : symptomItem.icon} size={20}
                  color={doneTypes.symptom ? symptomItem.color : colors.textMuted} />
              </View>
              <Text style={styles.symptomEntryText}>
                {doneTypes.symptom ? '今天已记录不适情况' : '点击选择症状或描述不适（可选）'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* 打卡记录弹窗（仅用于生活方式打卡项） */}
      <Modal visible={!!checkinModal} transparent animationType="slide" onRequestClose={() => setCheckinModal(null)}>
        <View style={styles.checkinModalOverlay}>
          <View style={styles.checkinModalBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {checkinModal && <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: checkinModal.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={checkinModal.icon} size={18} color={checkinModal.color} />
                </View>}
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>{checkinModal?.label} 打卡</Text>
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
                      backgroundColor: active ? colors.primary : colors.border + '50',
                      borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
                    <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.textSecondary }}>{label}</Text>
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
                          backgroundColor: active ? checkinModal.color : colors.border + '50',
                          borderWidth: 1, borderColor: active ? checkinModal.color : colors.border }}>
                        <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.textSecondary }}>{mt}</Text>
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
                          backgroundColor: active ? checkinModal.color : colors.border + '50',
                          borderWidth: 1, borderColor: active ? checkinModal.color : colors.border }}>
                        <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.textSecondary }}>{slot}</Text>
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
              <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: colors.border }]} onPress={() => setCheckinModal(null)} disabled={checkinSaving}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: checkinModal?.color || colors.primary, flex: 2, opacity: checkinSaving ? 0.6 : 1 }]} onPress={saveCheckin} disabled={checkinSaving}>
                {checkinSaving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', marginLeft: 4 }}>{checkinSaving ? '保存中...' : '完成打卡'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 生理指标打卡弹窗（血压/体重/睡眠/心率/血糖），原地填写，独立提交 */}
      <Modal visible={!!measureModal} transparent animationType="slide" onRequestClose={() => setMeasureModal(null)}>
        <View style={styles.checkinModalOverlay}>
          <View style={styles.checkinModalBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {measureModal && <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: measureModal.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={measureModal.icon} size={18} color={measureModal.color} />
                </View>}
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>{measureModal?.label} 打卡</Text>
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
                        backgroundColor: active ? colors.primary : colors.border + '50',
                        borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
                      <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.textSecondary }}>{opt}</Text>
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
                    睡眠时长：<Text style={{ fontWeight: '700', color: '#7B68EE' }}>{calcSleepDuration(measureValues.sleepTime, measureValues.wakeTime)} 小时</Text>
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
              <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: colors.border }]} onPress={() => setMeasureModal(null)} disabled={measureSaving}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: measureModal?.color || colors.primary, flex: 2, opacity: measureSaving ? 0.6 : 1 }]} onPress={saveMeasureCheckin} disabled={measureSaving}>
                {measureSaving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', marginLeft: 4 }}>{measureSaving ? '保存中...' : '完成打卡'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 症状自评弹窗：多选常见症状 + 自由文本，2026-07-18 新增 */}
      <Modal visible={symptomModal} transparent animationType="slide" onRequestClose={() => setSymptomModal(false)}>
        <View style={styles.checkinModalOverlay}>
          <View style={styles.checkinModalBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>今天有哪些不适？</Text>
              <TouchableOpacity onPress={() => setSymptomModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {ALL_SYMPTOM_OPTIONS.map(s => {
                const active = selectedSymptoms.includes(s);
                const urgent = URGENT_SYMPTOMS.includes(s);
                return (
                  <TouchableOpacity key={s} onPress={() => toggleSymptom(s)}
                    style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8,
                      backgroundColor: active ? (urgent ? colors.danger : colors.primary) : colors.border + '50',
                      borderWidth: 1, borderColor: active ? (urgent ? colors.danger : colors.primary) : colors.border }}>
                    <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.textSecondary }}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>其他描述（可选）</Text>
            <TextInput
              style={styles.checkinNoteInput}
              multiline
              numberOfLines={3}
              placeholder="描述具体不适情况，如部位、持续时间等"
              placeholderTextColor={colors.textMuted}
              value={symptomNote}
              onChangeText={setSymptomNote}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: colors.border }]} onPress={() => setSymptomModal(false)} disabled={symptomSaving}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.checkinModalBtn, { backgroundColor: colors.primary, flex: 2, opacity: symptomSaving ? 0.6 : 1 }]} onPress={saveSymptom} disabled={symptomSaving}>
                {symptomSaving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', marginLeft: 4 }}>{symptomSaving ? '保存中...' : '提交'}</Text>
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
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: 4 },
  pageTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },

  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  sectionProgress: { fontSize: 13, fontWeight: '700', color: colors.primary },

  checkinGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  checkinItem: {
    width: '30%', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white, gap: 5,
  },
  checkinIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  checkinItemLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  checkinAllDone: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: spacing.sm, padding: spacing.sm,
    backgroundColor: '#FEF9E7', borderRadius: radius.sm,
  },
  checkinAllDoneText: { fontSize: 12, color: '#B7791F', fontWeight: '600' },

  symptomEntry: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
  },
  symptomEntryDone: { backgroundColor: '#FDECEA' + '10', borderColor: colors.danger + '30' },
  symptomEntryText: { flex: 1, fontSize: 13, color: colors.textSecondary },

  checkinModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  checkinModalBox: {
    backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg, paddingBottom: 36,
  },
  checkinNoteInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: 12, fontSize: 14, color: colors.textPrimary,
    minHeight: 80, textAlignVertical: 'top', backgroundColor: colors.background,
  },
  checkinImageBtn: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm,
    borderStyle: 'dashed', minHeight: 80, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background, overflow: 'hidden',
  },
  checkinModalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: radius.md, flex: 1,
  },
});
