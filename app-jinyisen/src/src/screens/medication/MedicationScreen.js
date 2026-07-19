import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, Modal, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { medicationsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const MOCK_MEDICATIONS = [
  {
    id: 'M1', name: '苯磺酸氨氯地平片', dosage: '5mg', frequency: '每日1次', timing: '早饭后',
    startDate: '2026-01-15', note: '控制血压', todayChecked: true, compliance: 92,
  },
  {
    id: 'M2', name: '阿托伐他汀钙片', dosage: '10mg', frequency: '每日1次', timing: '睡前',
    startDate: '2026-02-01', note: '降低血脂', todayChecked: false, compliance: 85,
  },
  {
    id: 'M3', name: '叶酸片', dosage: '0.4mg', frequency: '每日1次', timing: '早饭后',
    startDate: '2026-03-10', note: '降低同型半胱氨酸', todayChecked: false, compliance: 78,
  },
];

const FREQ_OPTIONS = ['每日1次', '每日2次', '每日3次', '隔日1次', '每周1次'];
const TIME_OPTIONS = ['早饭前', '早饭后', '午饭后', '晚饭后', '睡前'];

function MedCard({ med, onCheck, onDelete }) {
  const compliance = med.compliance ?? 100;
  const compColor = compliance >= 90 ? colors.success : compliance >= 75 ? colors.warning : colors.danger;
  const todayChecked = med.todayChecked || false;
  const medId = med._id || med.id;
  const isStaffCreated = !!med.createdByStaff;

  return (
    <TouchableOpacity activeOpacity={0.9} onLongPress={() => !isStaffCreated && onDelete(medId, med.name)}>
      <View style={[styles.medCard, todayChecked && styles.medCardDone]}>
        <View style={styles.medHeader}>
          <View style={styles.medLeft}>
            <View style={[styles.medIcon, { backgroundColor: todayChecked ? colors.success10 : colors.primary10 }]}>
              <Ionicons name="medkit" size={20} color={todayChecked ? colors.success : colors.primary} />
            </View>
            <View style={styles.medInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.medName}>{med.name}</Text>
                {isStaffCreated && (
                  <View style={{ backgroundColor: '#E8F5EF', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                    <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '600' }}>医嘱</Text>
                  </View>
                )}
              </View>
              <Text style={styles.medDose}>
                {med.dose || med.dosage} · {med.freq || med.frequency || '每日1次'} · {med.time || med.timing || med.scheduledTime || ''}
              </Text>
              {(med.purpose || med.note) ? <Text style={styles.medPurpose}>{med.purpose || med.note}</Text> : null}
            </View>
          </View>
          {!isStaffCreated && (
            <TouchableOpacity
              onPress={() => onDelete(medId, med.name)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.medFooter}>
          <View style={styles.complianceWrap}>
            <Text style={styles.complianceLabel}>依从性</Text>
            <View style={styles.complianceBar}>
              <View style={[styles.complianceFill, { width: `${compliance}%`, backgroundColor: compColor }]} />
            </View>
            <Text style={[styles.complianceVal, { color: compColor }]}>{compliance}%</Text>
          </View>

          <View style={styles.medActions}>
            {med.remaining != null && (
              <View style={styles.remainingTag}>
                <Ionicons name="cube-outline" size={12} color={med.remaining <= 10 ? colors.warning : colors.textMuted} />
                <Text style={[styles.remainingText, med.remaining <= 10 && { color: colors.warning }]}>
                  剩余{med.remaining}片
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.checkBtn, todayChecked && styles.checkBtnDone]}
              onPress={() => onCheck(medId)}
            >
              <Ionicons
                name={todayChecked ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={16}
                color={todayChecked ? colors.white : colors.success}
              />
              <Text style={[styles.checkBtnText, todayChecked && styles.checkBtnTextDone]}>
                {todayChecked ? '今日已服' : '标记服药'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MedicationScreen({ navigation }) {
  const { isDemo } = useAuth();
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newMed, setNewMed] = useState({ name: '', dose: '', freq: '每日1次', time: '早饭后', purpose: '' });
  const [toast, setToast] = useState(null);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    const ms = type === 'success' ? 1800 : 3000;
    setTimeout(() => setToast(null), ms);
  };

  const loadMeds = useCallback(async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    try {
      const res = await medicationsAPI.list();
      if (res.success && res.data && res.data.length > 0) {
        const normalized = res.data.map(med => ({
          ...med,
          todayChecked: med.todayChecked != null
            ? med.todayChecked
            : (med.checkIns?.some(c => c.date === todayStr && c.status === 'taken') || false),
        }));
        setMeds(normalized);
      } else {
        setMeds(isDemo ? MOCK_MEDICATIONS : []);
      }
    } catch {
      setMeds(isDemo ? MOCK_MEDICATIONS : []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadMeds(); }, [loadMeds]);

  const todayDone = meds.filter(m => m.todayChecked).length;

  const handleCheck = async (id) => {
    // Optimistic update
    setMeds(prev => prev.map(m =>
      (m._id || m.id) === id ? { ...m, todayChecked: !m.todayChecked } : m
    ));
    try {
      await medicationsAPI.checkin(id);
    } catch {
      // Revert on failure
      setMeds(prev => prev.map(m =>
        (m._id || m.id) === id ? { ...m, todayChecked: !m.todayChecked } : m
      ));
    }
  };

  const handleDelete = async (id, name) => {
    setMeds(prev => prev.filter(m => (m._id || m.id) !== id));
    showToast('warn', `已删除「${name}」`);
    try { await medicationsAPI.delete(id); } catch {}
  };

  const handleAdd = async () => {
    if (!newMed.name || !newMed.dose) {
      showToast('warn', '请填写药品名称和剂量');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: newMed.name,
        dosage: newMed.dose,
        frequency: newMed.freq,
        timing: newMed.time,
        note: newMed.purpose,
        startDate: new Date().toISOString().slice(0, 10),
      };
      const res = await medicationsAPI.create(payload);
      if (res.success && res.data) {
        setMeds(prev => [...prev, { ...res.data, todayChecked: false }]);
      } else {
        setMeds(prev => [...prev, {
          id: `M${Date.now()}`, ...newMed,
          startDate: new Date().toISOString().slice(0, 10),
          remaining: 30, todayChecked: false, compliance: 100,
        }]);
      }
      setNewMed({ name: '', dose: '', freq: '每日1次', time: '早饭后', purpose: '' });
      setShowAdd(false);
      showToast('success', '用药计划已添加');
    } catch {
      showToast('error', '添加失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const pct = meds.length > 0 ? Math.round((todayDone / meds.length) * 100) : 0;

  // ── 本月依从性统计（从真实数据计算）─────────────────────────────
  const daysElapsed = new Date().getDate(); // 本月已过天数
  const dailyDoses  = meds.reduce((sum, m) => {
    const freq = m.frequency || m.freq || '';
    if (freq.includes('每日2次')) return sum + 2;
    if (freq.includes('每日3次')) return sum + 3;
    if (freq.includes('隔日'))   return sum + 0.5;
    return sum + 1;
  }, 0);
  const expectedTotal = meds.length > 0 ? Math.round(daysElapsed * dailyDoses) : 0;
  const avgCompliance = meds.length > 0
    ? Math.round(meds.reduce((s, m) => s + (m.compliance ?? 100), 0) / meds.length)
    : null;
  const actualTotal = expectedTotal > 0 && avgCompliance != null
    ? Math.round(expectedTotal * avgCompliance / 100)
    : 0;

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
            <Text style={styles.pageSubtitle}>{todayDone}/{meds.length} 种今日已服</Text>
          </View>
          <TouchableOpacity style={styles.addBtnHeader} onPress={() => setShowAdd(true)}>
            <Ionicons name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Toast */}
      {toast && (
        <View style={[
          styles.toast,
          toast.type === 'success' && styles.toastSuccess,
          toast.type === 'error'   && styles.toastError,
          toast.type === 'warn'    && styles.toastWarn,
        ]}>
          <Text style={styles.toastText}>{toast.msg}</Text>
        </View>
      )}

      {/* Today summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryLeft}>
          <Text style={styles.summaryTitle}>今日服药进度</Text>
          <Text style={styles.summaryDesc}>{todayDone}/{meds.length} 种药已服用</Text>
        </View>
        <View style={styles.summaryCircle}>
          <Text style={[styles.summaryNum, { color: pct === 100 && meds.length > 0 ? colors.success : colors.warning }]}>
            {pct}%
          </Text>
        </View>
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
        ) : (
          <>
            <Text style={styles.sectionLabel}>我的用药计划</Text>
            {meds.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="medkit-outline" size={48} color={colors.border} />
                <Text style={styles.emptyText}>暂无用药记录</Text>
                <Text style={styles.emptySubtext}>点击右上角 + 添加用药计划</Text>
              </View>
            ) : (
              meds.map(med => (
                <MedCard key={med._id || med.id} med={med} onCheck={handleCheck} onDelete={handleDelete} />
              ))
            )}
          </>
        )}

        {/* History summary — 仅在有用药数据时显示 */}
        {meds.length > 0 && (
          <View style={styles.historyCard}>
            <Text style={styles.historyTitle}>本月依从性统计</Text>
            <View style={styles.historyRow}>
              {[
                { label: '应服次数', val: expectedTotal > 0 ? `${expectedTotal}次` : '--' },
                { label: '实际服药', val: actualTotal   > 0 ? `${actualTotal}次`  : '--' },
                { label: '平均依从性', val: avgCompliance != null ? `${avgCompliance}%` : '--' },
              ].map((item, i) => (
                <View key={i} style={styles.historyItem}>
                  <Text style={styles.historyVal}>{item.val}</Text>
                  <Text style={styles.historyLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Add medication modal */}
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
                { label: '药品名称 *', key: 'name', placeholder: '如：苯磺酸氨氯地平片' },
                { label: '剂量 *', key: 'dose', placeholder: '如：5mg、1片' },
                { label: '用药目的', key: 'purpose', placeholder: '如：控制血压' },
              ].map(field => (
                <View key={field.key} style={styles.formGroup}>
                  <Text style={styles.formLabel}>{field.label}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={field.placeholder}
                    value={newMed[field.key]}
                    onChangeText={v => setNewMed(p => ({ ...p, [field.key]: v }))}
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              ))}

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>服药频次</Text>
                <View style={styles.tagGrid}>
                  {FREQ_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.tag, newMed.freq === opt && styles.tagActive]}
                      onPress={() => setNewMed(p => ({ ...p, freq: opt }))}
                    >
                      <Text style={[styles.tagText, newMed.freq === opt && styles.tagTextActive]}>{opt}</Text>
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
                      style={[styles.tag, newMed.time === opt && styles.tagActive]}
                      onPress={() => setNewMed(p => ({ ...p, time: opt }))}
                    >
                      <Text style={[styles.tagText, newMed.time === opt && styles.tagTextActive]}>{opt}</Text>
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
                  : <Text style={styles.submitBtnText}>添加用药计划</Text>
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
  list: { flex: 1, paddingHorizontal: spacing.lg },
  sectionLabel: {
    fontSize: 14, fontWeight: '700', color: colors.textSecondary,
    marginTop: spacing.md, marginBottom: spacing.sm,
  },
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xl * 2 },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginTop: spacing.md },
  emptySubtext: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  medCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  medCardDone: { borderLeftColor: colors.success, opacity: 0.85 },
  medHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: spacing.sm,
  },
  medLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  medIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  medInfo: { flex: 1 },
  medName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  medDose: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  medPurpose: { fontSize: 11, color: colors.primary, marginTop: 2 },
  medFooter: { borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: spacing.sm },
  complianceWrap: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, marginBottom: spacing.xs,
  },
  complianceLabel: { fontSize: 11, color: colors.textMuted, width: 36 },
  complianceBar: { flex: 1, height: 4, backgroundColor: colors.borderLight, borderRadius: 2 },
  complianceFill: { height: 4, borderRadius: 2 },
  complianceVal: { fontSize: 12, fontWeight: '700', width: 32, textAlign: 'right' },
  medActions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  remainingTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  remainingText: { fontSize: 12, color: colors.textMuted },
  checkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.success,
  },
  checkBtnDone: { backgroundColor: colors.success, borderColor: colors.success },
  checkBtnText: { fontSize: 12, color: colors.success, fontWeight: '600' },
  checkBtnTextDone: { color: colors.white },
  historyCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginTop: spacing.sm, ...shadow.sm,
  },
  historyTitle: {
    fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm,
  },
  historyRow: { flexDirection: 'row', justifyContent: 'space-around' },
  historyItem: { alignItems: 'center' },
  historyVal: { fontSize: 18, fontWeight: '800', color: colors.primary },
  historyLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  formGroup: { marginBottom: spacing.md },
  formLabel: {
    fontSize: 13, fontWeight: '600',
    color: colors.textSecondary, marginBottom: spacing.xs,
  },
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
  toastError:   { backgroundColor: '#DC3545' },
  toastWarn:    { backgroundColor: '#F39C12' },
  toastText:    { color: colors.white, fontSize: 13, fontWeight: '600' },
});
