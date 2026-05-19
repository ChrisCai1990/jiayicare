import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, Modal, RefreshControl, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { medicationsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// 日期选择器：web 用原生 date input，其他平台用文本输入
function DateField({ value, onChange, placeholder }) {
  if (Platform.OS === 'web') {
    return (
      <input
        type="date"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '11px 12px', fontSize: 15,
          border: `1.5px solid ${colors.border}`,
          borderRadius: radius.sm,
          backgroundColor: colors.background,
          color: value ? colors.textPrimary : colors.textMuted,
          outline: 'none', fontFamily: 'inherit',
        }}
      />
    );
  }
  return (
    <TextInput
      style={dateFieldStyles.input}
      value={value || ''}
      onChangeText={onChange}
      placeholder={placeholder || 'YYYY-MM-DD'}
      placeholderTextColor={colors.textMuted}
    />
  );
}
const dateFieldStyles = StyleSheet.create({
  input: {
    backgroundColor: colors.background, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: 15, color: colors.textPrimary,
    borderWidth: 1.5, borderColor: colors.border,
  },
});

const FREQ_OPTIONS = ['每日1次', '每日2次', '每日3次', '隔日1次', '每周1次', '按需服用'];
const TIME_OPTIONS = ['早饭前', '早饭后', '午饭后', '晚饭后', '睡前', '不限时间'];
const METHOD_OPTIONS = ['口服', '外用', '注射', '含服', '吸入', '其他'];

const EMPTY_FORM = {
  name: '', brandName: '', dosage: '', method: '口服',
  frequency: '每日1次', timing: '早饭后', startDate: '', note: '',
};

function MedCard({ med, onCheck, onStop, onDelete, stopped }) {
  const medId = med._id || med.id;
  const todayChecked = !stopped && (med.todayChecked || false);

  return (
    <View style={[styles.medCard, stopped && styles.medCardStopped]}>
      <View style={styles.medHeader}>
        <View style={[styles.medIcon, { backgroundColor: stopped ? '#F5F5F5' : colors.primary10 }]}>
          <Ionicons name="medkit" size={20} color={stopped ? colors.textMuted : colors.primary} />
        </View>
        <View style={styles.medInfo}>
          <View style={styles.medNameRow}>
            <Text style={[styles.medName, stopped && { color: colors.textMuted }]}>{med.name}</Text>
            {med.brandName ? (
              <Text style={styles.brandBadge}>{med.brandName}</Text>
            ) : null}
            {stopped && <Text style={styles.stoppedBadge}>已停用</Text>}
          </View>
          <Text style={styles.medDose}>
            {med.dosage} · {med.method || '口服'} · {med.frequency}
            {med.timing ? ` · ${med.timing}` : ''}
          </Text>
          {med.startDate ? <Text style={styles.medDate}>开始：{med.startDate}</Text> : null}
          {stopped && med.stopDate ? <Text style={styles.stopDateText}>停用：{med.stopDate}</Text> : null}
          {med.note ? <Text style={styles.medNote}>{med.note}</Text> : null}
        </View>
        <TouchableOpacity onPress={() => onDelete(medId, med.name)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {!stopped && (
        <View style={styles.medActions}>
          <TouchableOpacity
            style={styles.stopBtn}
            onPress={() => onStop(medId, med.name)}
          >
            <Ionicons name="stop-circle-outline" size={14} color={colors.warning} />
            <Text style={styles.stopBtnText}>标记停用</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.checkBtn, todayChecked && styles.checkBtnDone]}
            onPress={() => onCheck(medId)}
          >
            <Ionicons
              name={todayChecked ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={15}
              color={todayChecked ? colors.white : colors.success}
            />
            <Text style={[styles.checkBtnText, todayChecked && styles.checkBtnTextDone]}>
              {todayChecked ? '今日已服' : '标记服药'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function MedicationScreen({ navigation }) {
  const { isDemo } = useAuth();
  const [tab, setTab] = useState('active'); // 'active' | 'stopped'
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toast, setToast] = useState(null);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), type === 'success' ? 1800 : 3000);
  };

  const loadMeds = useCallback(async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    try {
      const res = await medicationsAPI.list(); // get all
      if (res.success && res.data) {
        const normalized = res.data.map(med => ({
          ...med,
          todayChecked: med.checkIns?.some(c => c.date === todayStr && c.status === 'taken') || false,
        }));
        setMeds(normalized);
      } else {
        setMeds([]);
      }
    } catch {
      setMeds([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadMeds(); }, [loadMeds]);

  const activeMeds  = meds.filter(m => !m.stopped && m.active !== false);
  const stoppedMeds = meds.filter(m => m.stopped);
  const displayed   = tab === 'active' ? activeMeds : stoppedMeds;

  const todayDone = activeMeds.filter(m => m.todayChecked).length;
  const pct = activeMeds.length > 0 ? Math.round((todayDone / activeMeds.length) * 100) : 0;

  const handleCheck = async (id) => {
    setMeds(prev => prev.map(m =>
      (m._id || m.id) === id ? { ...m, todayChecked: !m.todayChecked } : m
    ));
    try { await medicationsAPI.checkin(id); } catch {
      setMeds(prev => prev.map(m =>
        (m._id || m.id) === id ? { ...m, todayChecked: !m.todayChecked } : m
      ));
    }
  };

  const handleStop = async (id, name) => {
    const today = new Date().toISOString().split('T')[0];
    setMeds(prev => prev.map(m =>
      (m._id || m.id) === id ? { ...m, stopped: true, stopDate: today } : m
    ));
    showToast('warn', `「${name}」已标记停用`);
    try { await medicationsAPI.stop(id, { stopDate: today }); } catch {}
  };

  const handleDelete = async (id, name) => {
    setMeds(prev => prev.filter(m => (m._id || m.id) !== id));
    showToast('warn', `已删除「${name}」`);
    try { await medicationsAPI.delete(id); } catch {}
  };

  const handleAdd = async () => {
    if (!form.name || !form.dosage || !form.frequency) {
      showToast('warn', '请填写化学名/通用名、剂量和使用频次');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        brandName: form.brandName,
        dosage: form.dosage,
        method: form.method,
        frequency: form.frequency,
        timing: form.timing,
        startDate: form.startDate || new Date().toISOString().slice(0, 10),
        note: form.note,
      };
      const res = await medicationsAPI.create(payload);
      if (res.success && res.data) {
        setMeds(prev => [{ ...res.data, todayChecked: false }, ...prev]);
      }
      setForm(EMPTY_FORM);
      setShowAdd(false);
      showToast('success', '用药记录已添加');
    } catch {
      showToast('error', '添加失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.topBar}>
        <View style={styles.topBarDecor} />
        <View style={styles.topBarRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={styles.topBarCenter}>
            <Text style={styles.pageTitle}>用药管理</Text>
            <Text style={styles.pageSubtitle}>全生命周期用药记录</Text>
          </View>
          <TouchableOpacity style={styles.addBtnHeader} onPress={() => setShowAdd(true)}>
            <Ionicons name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Toast */}
      {toast && (
        <View style={[styles.toast, styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}`]]}>
          <Text style={styles.toastText}>{toast.msg}</Text>
        </View>
      )}

      {/* Today summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryLeft}>
          <Text style={styles.summaryTitle}>今日服药进度</Text>
          <Text style={styles.summaryDesc}>{todayDone}/{activeMeds.length} 种已服</Text>
        </View>
        <View style={styles.summaryCircle}>
          <Text style={[styles.summaryNum, { color: pct === 100 && activeMeds.length > 0 ? colors.success : colors.warning }]}>
            {pct}%
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {[
          { key: 'active', label: `进行中 (${activeMeds.length})` },
          { key: 'stopped', label: `已停用 (${stoppedMeds.length})` },
        ].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMeds(); }} tintColor={colors.primary} />
        }
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : displayed.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="medkit-outline" size={48} color={colors.border} />
            <Text style={styles.emptyText}>{tab === 'active' ? '暂无进行中的用药记录' : '暂无已停用的用药记录'}</Text>
            {tab === 'active' && <Text style={styles.emptySubtext}>点击右上角 + 添加用药记录</Text>}
          </View>
        ) : (
          displayed.map(med => (
            <MedCard
              key={med._id || med.id}
              med={med}
              stopped={tab === 'stopped'}
              onCheck={handleCheck}
              onStop={handleStop}
              onDelete={handleDelete}
            />
          ))
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Add modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>添加用药记录</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                { label: '化学名/通用名 *', key: 'name', placeholder: '如：苯磺酸氨氯地平' },
                { label: '商品名（可选）', key: 'brandName', placeholder: '如：络活喜' },
                { label: '剂量 *', key: 'dosage', placeholder: '如：5mg、1片' },
                { label: '备注', key: 'note', placeholder: '如：控制血压' },
              ].map(f => (
                <View key={f.key} style={styles.formGroup}>
                  <Text style={styles.formLabel}>{f.label}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={f.placeholder}
                    value={form[f.key]}
                    onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              ))}

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>开始使用日期</Text>
                <DateField
                  value={form.startDate}
                  onChange={v => setForm(p => ({ ...p, startDate: v }))}
                  placeholder="选择开始日期"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>使用方法</Text>
                <View style={styles.tagGrid}>
                  {METHOD_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.tag, form.method === opt && styles.tagActive]}
                      onPress={() => setForm(p => ({ ...p, method: opt }))}
                    >
                      <Text style={[styles.tagText, form.method === opt && styles.tagTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>使用频次 *</Text>
                <View style={styles.tagGrid}>
                  {FREQ_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.tag, form.frequency === opt && styles.tagActive]}
                      onPress={() => setForm(p => ({ ...p, frequency: opt }))}
                    >
                      <Text style={[styles.tagText, form.frequency === opt && styles.tagTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>服药时间</Text>
                <View style={styles.tagGrid}>
                  {TIME_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.tag, form.timing === opt && styles.tagActive]}
                      onPress={() => setForm(p => ({ ...p, timing: opt }))}
                    >
                      <Text style={[styles.tagText, form.timing === opt && styles.tagTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, saving && { opacity: 0.6 }]}
                onPress={handleAdd}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.submitBtnText}>添加用药记录</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg,
    backgroundColor: colors.primary, overflow: 'hidden', position: 'relative',
  },
  topBarDecor: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.05)', top: -60, right: -40,
  },
  topBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topBarCenter: { flex: 1, alignItems: 'center' },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  pageSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  addBtnHeader: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white, marginHorizontal: spacing.lg, marginTop: -spacing.sm,
    borderRadius: radius.lg, padding: spacing.md, ...shadow.md,
  },
  summaryLeft: { flex: 1 },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  summaryDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  summaryCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary10,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryNum: { fontSize: 16, fontWeight: '800' },
  tabRow: {
    flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.white },
  list: { flex: 1, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary, marginTop: spacing.md },
  emptySubtext: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  medCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  medCardStopped: { borderLeftColor: colors.textMuted, opacity: 0.75 },
  medHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  medIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  medInfo: { flex: 1 },
  medNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 3 },
  medName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  brandBadge: {
    fontSize: 10, color: '#0077B6', backgroundColor: '#EBF5FB',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontWeight: '600',
  },
  stoppedBadge: {
    fontSize: 10, color: colors.textMuted, backgroundColor: '#F5F5F5',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontWeight: '600',
  },
  medDose: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  medDate: { fontSize: 11, color: colors.textMuted },
  stopDateText: { fontSize: 11, color: colors.warning },
  medNote: { fontSize: 11, color: colors.primary, marginTop: 2 },
  medActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.warning,
  },
  stopBtnText: { fontSize: 12, color: colors.warning, fontWeight: '600' },
  checkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.success,
  },
  checkBtnDone: { backgroundColor: colors.success, borderColor: colors.success },
  checkBtnText: { fontSize: 12, color: colors.success, fontWeight: '600' },
  checkBtnTextDone: { color: colors.white },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  formGroup: { marginBottom: spacing.md },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  formInput: {
    backgroundColor: colors.background, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: 15, color: colors.textPrimary,
    borderWidth: 1.5, borderColor: colors.border,
  },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: {
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
  },
  tagActive: { borderColor: colors.primary, backgroundColor: colors.primary10 },
  tagText: { fontSize: 12, color: colors.textSecondary },
  tagTextActive: { color: colors.primary, fontWeight: '600' },
  submitBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
    marginTop: spacing.md, marginBottom: spacing.lg,
  },
  submitBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  toast: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  toastSuccess: { backgroundColor: '#22A06B' },
  toastError: { backgroundColor: '#DC3545' },
  toastWarn: { backgroundColor: '#F39C12' },
  toastText: { color: colors.white, fontSize: 13, fontWeight: '600' },
});
