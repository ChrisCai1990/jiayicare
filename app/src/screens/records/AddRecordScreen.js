import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, TextInput, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { recordsAPI } from '../../services/api';

const RECORD_TYPES = [
  { id: 'bloodPressure', label: '血压', icon: 'heart', color: colors.danger, fields: [
    { key: 'sys', label: '收缩压', unit: 'mmHg', placeholder: '如：130', normal: '90-139' },
    { key: 'dia', label: '舒张压', unit: 'mmHg', placeholder: '如：80', normal: '60-89' },
  ]},
  { id: 'bloodSugar', label: '血糖', icon: 'water', color: colors.info, fields: [
    { key: 'value', label: '血糖值', unit: 'mmol/L', placeholder: '如：6.1', normal: '3.9-6.1' },
  ]},
  { id: 'heartRate', label: '心率', icon: 'pulse', color: colors.danger, fields: [
    { key: 'value', label: '心率', unit: '次/分', placeholder: '如：72', normal: '60-100' },
  ]},
  { id: 'weight', label: '体重', icon: 'barbell', color: colors.warning, fields: [
    { key: 'value', label: '体重', unit: 'kg', placeholder: '如：70.5', normal: '视BMI而定' },
  ]},
  { id: 'sleep', label: '睡眠', icon: 'moon', color: '#7B68EE', fields: [] },
  { id: 'mood', label: '情绪', icon: 'happy', color: colors.accent, fields: [] },
];

// 根据入睡和醒来时间计算睡眠时长（跨午夜自动处理）
function calcSleepDuration(sleepTime, wakeTime) {
  const parse = (t) => {
    const parts = t.replace('：', ':').split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  };
  let s = parse(sleepTime);
  let w = parse(wakeTime);
  if (w <= s) w += 24 * 60; // 跨午夜
  return ((w - s) / 60).toFixed(1);
}

// ── 时间选择器组件 ──────────────────────────────────────────────────
const ITEM_H = 48;
const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

function TimePickerModal({ visible, title, value, onChange, onClose }) {
  const initH = value ? value.split(':')[0] : '22';
  const initM = value ? String(Math.round(parseInt(value.split(':')[1] || '0') / 5) * 5).padStart(2, '0') : '00';

  const [selH, setSelH] = useState(initH);
  const [selM, setSelM] = useState(initM);
  const hourRef = useRef(null);
  const minRef  = useRef(null);

  useEffect(() => {
    if (visible) {
      const h = value ? value.split(':')[0] : '22';
      const m = value ? String(Math.round(parseInt(value.split(':')[1] || '0') / 5) * 5).padStart(2, '0') : '00';
      setSelH(h);
      setSelM(m);
      setTimeout(() => {
        hourRef.current?.scrollToIndex({ index: parseInt(h), animated: false });
        minRef.current?.scrollToIndex({ index: Math.round(parseInt(m) / 5), animated: false });
      }, 50);
    }
  }, [visible]);

  const handleConfirm = () => {
    onChange(`${selH}:${selM}`);
    onClose();
  };

  const renderItem = (item, selected, onSelect) => (
    <TouchableOpacity
      style={[tpStyles.item, item === selected && tpStyles.itemSelected]}
      onPress={() => onSelect(item)}
    >
      <Text style={[tpStyles.itemText, item === selected && tpStyles.itemTextSelected]}>{item}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={tpStyles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={tpStyles.sheet}>
        <View style={tpStyles.header}>
          <Text style={tpStyles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={tpStyles.pickerRow}>
          {/* 小时列 */}
          <View style={tpStyles.colWrap}>
            <Text style={tpStyles.colLabel}>时</Text>
            <View style={tpStyles.listWrap}>
              <View style={tpStyles.highlight} pointerEvents="none" />
              <FlatList
                ref={hourRef}
                data={HOURS}
                keyExtractor={i => i}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_H}
                decelerationRate="fast"
                getItemLayout={(_, idx) => ({ length: ITEM_H, offset: ITEM_H * idx, index: idx })}
                renderItem={({ item }) => renderItem(item, selH, setSelH)}
                contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
              />
            </View>
          </View>

          <Text style={tpStyles.colon}>:</Text>

          {/* 分钟列 */}
          <View style={tpStyles.colWrap}>
            <Text style={tpStyles.colLabel}>分</Text>
            <View style={tpStyles.listWrap}>
              <View style={tpStyles.highlight} pointerEvents="none" />
              <FlatList
                ref={minRef}
                data={MINUTES}
                keyExtractor={i => i}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_H}
                decelerationRate="fast"
                getItemLayout={(_, idx) => ({ length: ITEM_H, offset: ITEM_H * idx, index: idx })}
                renderItem={({ item }) => renderItem(item, selM, setSelM)}
                contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
              />
            </View>
          </View>
        </View>

        <TouchableOpacity style={tpStyles.confirmBtn} onPress={handleConfirm}>
          <Text style={tpStyles.confirmText}>确定</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const tpStyles = StyleSheet.create({
  overlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:       {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  pickerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: spacing.lg },
  colWrap:     { alignItems: 'center', flex: 1 },
  colLabel:    { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  listWrap:    { height: ITEM_H * 5, width: '100%', overflow: 'hidden', position: 'relative' },
  highlight:   {
    position: 'absolute', top: ITEM_H * 2, left: 0, right: 0, height: ITEM_H,
    backgroundColor: '#7B68EE18', borderRadius: radius.sm,
    borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: '#7B68EE44',
    zIndex: 1,
  },
  item:        { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemSelected:{ },
  itemText:    { fontSize: 22, color: colors.textMuted, fontWeight: '400' },
  itemTextSelected: { fontSize: 26, color: '#7B68EE', fontWeight: '700' },
  colon:       { fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginTop: 20 },
  confirmBtn:  {
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: '#7B68EE', borderRadius: radius.md, height: 50,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});

const TIME_OPTIONS = ['现在', '今日早上', '今日中午', '今日晚上', '昨日'];
const MEASURE_OPTIONS = { bloodSugar: ['空腹', '餐后2小时', '睡前'], bloodPressure: ['左臂', '右臂'] };

export default function AddRecordScreen({ navigation, route }) {
  const initialType = route?.params?.type
    ? RECORD_TYPES.find(t => t.id === route.params.type) || RECORD_TYPES[0]
    : RECORD_TYPES[0];
  const [activeType, setActiveType] = useState(initialType);
  const [values, setValues] = useState({});
  const [time, setTime] = useState('现在');
  const [note, setNote] = useState('');
  const [measureOption, setMeasureOption] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success'|'error'|'warn', msg: string }
  const [timePicker, setTimePicker] = useState(null); // { key: 'sleepTime'|'wakeTime', title: string }

  // Toast 自动消失（成功 1.8s，错误 3s）
  useEffect(() => {
    if (!toast) return;
    const delay = toast.type === 'success' ? 1800 : 3000;
    const t = setTimeout(() => setToast(null), delay);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (type, msg) => setToast({ type, msg });

  const setValue = (key, val) => setValues(prev => ({ ...prev, [key]: val }));

  const getStatus = (field, val) => {
    if (!val) return null;
    const v = parseFloat(val);
    if (field.key === 'sys') return v >= 140 ? 'high' : v < 90 ? 'low' : 'normal';
    if (field.key === 'dia') return v >= 90 ? 'high' : v < 60 ? 'low' : 'normal';
    if (activeType.id === 'bloodSugar') return v > 7 ? 'high' : v < 3.9 ? 'low' : 'normal';
    if (activeType.id === 'heartRate') return v > 100 ? 'high' : v < 60 ? 'low' : 'normal';
    return 'normal';
  };

  const statusConfig = { normal: { color: colors.success, label: '正常' }, high: { color: colors.danger, label: '偏高' }, low: { color: colors.info, label: '偏低' } };

  const handleSubmit = async () => {
    const hasValue = activeType.id === 'sleep'
      ? (values.sleepTime && values.wakeTime)
      : activeType.id === 'mood'
      ? !!values.value
      : activeType.fields.every(f => values[f.key]);
    if (!hasValue) {
      const warnMsg = activeType.id === 'sleep' ? '请填写入睡时间和醒来时间'
        : activeType.id === 'mood' ? '请选择情绪评分'
        : '请填写完整数值';
      showToast('warn', warnMsg);
      return;
    }

    setSaving(true);
    setToast(null);
    try {
      const CATEGORY_MAP = {
        bloodPressure: 'vitals', bloodSugar: 'vitals', heartRate: 'vitals',
        weight: 'metabolism', sleep: 'lifestyle', mood: 'lifestyle',
      };

      let payload = {
        category: CATEGORY_MAP[activeType.id] || 'vitals',
        type: activeType.id,
        label: activeType.label,
        unit: activeType.fields[0]?.unit || '',
        note: [measureOption, note].filter(Boolean).join(' · ') || '',
      };

      if (activeType.id === 'bloodPressure') {
        const sys = parseInt(values.sys, 10);
        const dia = parseInt(values.dia, 10);
        payload.value = `${sys}/${dia}`;
        payload.extra = { sys, dia };
        payload.status = sys >= 140 || dia >= 90 ? 'warning' : sys < 90 || dia < 60 ? 'low' : 'normal';
      } else if (activeType.id === 'sleep') {
        const dur = calcSleepDuration(values.sleepTime, values.wakeTime);
        payload.value = String(dur);
        payload.unit = '小时';
        payload.extra = { sleepTime: values.sleepTime, wakeTime: values.wakeTime };
        const durF = parseFloat(dur);
        payload.status = durF >= 7 && durF <= 9 ? 'normal' : durF < 7 ? 'low' : 'warning';
      } else {
        payload.value = String(values.value);
        payload.status = (() => {
          const v = parseFloat(values.value);
          if (activeType.id === 'bloodSugar') return v > 7 ? 'warning' : v < 3.9 ? 'low' : 'normal';
          if (activeType.id === 'heartRate') return v > 100 ? 'warning' : v < 60 ? 'low' : 'normal';
          return 'normal';
        })();
      }

      await recordsAPI.create(payload);
      showToast('success', '✅ 记录成功，数据已保存');
      // 成功后 1.5s 自动返回
      setTimeout(() => navigation.goBack(), 1500);
    } catch (err) {
      showToast('error', `保存失败：${err.message || '网络异常，请重试'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>录入健康数据</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Toast 提示 Banner */}
      {toast && (
        <View style={[styles.toast, styles[`toast_${toast.type}`]]}>
          <Text style={styles.toastText}>{toast.msg}</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Type selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {RECORD_TYPES.map(type => (
            <TouchableOpacity
              key={type.id}
              style={[styles.typeChip, activeType.id === type.id && { borderColor: type.color, backgroundColor: type.color + '12' }]}
              onPress={() => { setActiveType(type); setValues({}); setMeasureOption(''); }}
            >
              <Ionicons name={type.icon} size={16} color={activeType.id === type.id ? type.color : colors.textMuted} />
              <Text style={[styles.typeChipText, activeType.id === type.id && { color: type.color, fontWeight: '700' }]}>{type.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input card */}
        <View style={styles.inputCard}>
          <View style={styles.inputCardHeader}>
            <View style={[styles.typeIcon, { backgroundColor: activeType.color + '15' }]}>
              <Ionicons name={activeType.icon} size={24} color={activeType.color} />
            </View>
            <View>
              <Text style={styles.inputCardTitle}>{activeType.label}记录</Text>
              <Text style={styles.inputCardTime}>{new Date().toLocaleDateString('zh-CN')}</Text>
            </View>
          </View>

          {/* Measure options */}
          {MEASURE_OPTIONS[activeType.id] && (
            <View style={styles.measureRow}>
              {MEASURE_OPTIONS[activeType.id].map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.measureChip, measureOption === opt && styles.measureChipActive]}
                  onPress={() => setMeasureOption(opt)}
                >
                  <Text style={[styles.measureChipText, measureOption === opt && styles.measureChipTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Value inputs */}
          {activeType.fields.map(field => {
            const status = getStatus(field, values[field.key]);
            const sConf = status ? statusConfig[status] : null;
            return (
              <View key={field.key} style={styles.fieldRow}>
                <View style={styles.fieldInfo}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <Text style={styles.fieldNormal}>正常值：{field.normal}</Text>
                </View>
                <View style={[styles.valueInput, sConf && { borderColor: sConf.color }]}>
                  <TextInput
                    style={styles.valueInputText}
                    placeholder={field.placeholder}
                    keyboardType="decimal-pad"
                    value={values[field.key] || ''}
                    onChangeText={v => setValue(field.key, v)}
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.unitText}>{field.unit}</Text>
                </View>
                {sConf && (
                  <View style={[styles.statusBadge, { backgroundColor: sConf.color + '15' }]}>
                    <Text style={[styles.statusBadgeText, { color: sConf.color }]}>{sConf.label}</Text>
                  </View>
                )}
              </View>
            );
          })}

          {/* 睡眠专属：入睡时间 + 醒来时间 + 自动计算时长 */}
          {activeType.id === 'sleep' && (
            <View>
              {[
                { key: 'sleepTime', label: '入睡时间', placeholder: '点击选择' },
                { key: 'wakeTime',  label: '醒来时间', placeholder: '点击选择' },
              ].map(f => (
                <View key={f.key} style={styles.fieldRow}>
                  <View style={styles.fieldInfo}>
                    <Text style={styles.fieldLabel}>{f.label}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.valueInput, styles.timePickerBtn]}
                    onPress={() => setTimePicker({ key: f.key, title: f.label })}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="time-outline" size={18} color={values[f.key] ? '#7B68EE' : colors.textMuted} />
                    <Text style={[styles.timePickerBtnText, values[f.key] && styles.timePickerBtnTextSelected]}>
                      {values[f.key] || f.placeholder}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
              {values.sleepTime && values.wakeTime ? (
                <View style={styles.sleepDurRow}>
                  <Ionicons name="moon" size={14} color="#7B68EE" />
                  <Text style={styles.sleepDurText}>
                    睡眠时长：<Text style={styles.sleepDurVal}>{calcSleepDuration(values.sleepTime, values.wakeTime)} 小时</Text>
                  </Text>
                  <Text style={styles.sleepDurNormal}>（正常 7-9 小时）</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Mood slider for mood type */}
          {activeType.id === 'mood' && (
            <View style={styles.moodRow}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.moodBtn, parseInt(values.value) === n && { backgroundColor: colors.accent }]}
                  onPress={() => setValue('value', String(n))}
                >
                  <Text style={[styles.moodBtnText, parseInt(values.value) === n && { color: colors.white }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Time */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>记录时间</Text>
          <View style={styles.timeRow}>
            {TIME_OPTIONS.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.timeChip, time === t && styles.timeChipActive]}
                onPress={() => setTime(t)}
              >
                <Text style={[styles.timeChipText, time === t && styles.timeChipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Note */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>备注（可选）</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="如：饭后测量、运动后等..."
            multiline
            numberOfLines={3}
            value={note}
            onChangeText={setNote}
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 时间选择器 Modal */}
      <TimePickerModal
        visible={!!timePicker}
        title={timePicker?.title || ''}
        value={timePicker ? (values[timePicker.key] || '') : ''}
        onChange={v => timePicker && setValue(timePicker.key, v)}
        onClose={() => setTimePicker(null)}
      />

      {/* Submit */}
      <View style={styles.footer}>
        <TouchableOpacity style={[styles.submitBtn, saving && { opacity: 0.7 }]} onPress={handleSubmit} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Ionicons name="checkmark-circle" size={20} color={colors.white} />}
          <Text style={styles.submitBtnText}>{saving ? '保存中…' : '保存记录'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  typeScroll: { paddingVertical: spacing.md, maxHeight: 56 },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeChipText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  inputCard: {
    backgroundColor: colors.surface, marginHorizontal: spacing.lg,
    borderRadius: radius.lg, padding: spacing.lg, ...shadow.sm,
  },
  inputCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  typeIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  inputCardTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  inputCardTime: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  measureRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  measureChip: {
    paddingHorizontal: spacing.sm, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
  },
  measureChipActive: { borderColor: colors.primary, backgroundColor: colors.primary10 },
  measureChipText: { fontSize: 12, color: colors.textSecondary },
  measureChipTextActive: { color: colors.primary, fontWeight: '600' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  fieldInfo: { width: 90 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  fieldNormal: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  valueInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2,
    borderWidth: 2, borderColor: colors.border,
  },
  valueInputText: { flex: 1, fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  unitText: { fontSize: 12, color: colors.textMuted },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  timePickerBtn: { justifyContent: 'space-between', gap: 8 },
  timePickerBtnText: { flex: 1, fontSize: 18, fontWeight: '500', color: colors.textMuted },
  timePickerBtnTextSelected: { color: '#7B68EE', fontWeight: '700' },
  sleepDurRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.sm, backgroundColor: '#F0EEFF',
    borderRadius: radius.sm, padding: spacing.sm,
  },
  sleepDurText: { fontSize: 13, color: colors.textSecondary },
  sleepDurVal: { fontSize: 14, fontWeight: '700', color: '#7B68EE' },
  sleepDurNormal: { fontSize: 11, color: colors.textMuted },
  moodRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: spacing.sm },
  moodBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  moodBtnText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  section: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeChip: {
    paddingHorizontal: spacing.md, paddingVertical: 7,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  timeChipActive: { borderColor: colors.primary, backgroundColor: colors.primary10 },
  timeChipText: { fontSize: 13, color: colors.textSecondary },
  timeChipTextActive: { color: colors.primary, fontWeight: '600' },
  noteInput: {
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.border,
    padding: spacing.sm, fontSize: 14, color: colors.textPrimary,
    height: 80, textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: radius.md, height: 52, gap: spacing.xs,
    ...shadow.md,
  },
  submitBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },

  // Toast
  toast: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  toast_success: { backgroundColor: '#E6F9F0', borderLeftWidth: 3, borderLeftColor: colors.success },
  toast_error:   { backgroundColor: '#FEF0F0', borderLeftWidth: 3, borderLeftColor: colors.danger },
  toast_warn:    { backgroundColor: '#FFF8E6', borderLeftWidth: 3, borderLeftColor: colors.warning },
  toastText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
});
