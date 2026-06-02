import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, Modal, RefreshControl, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { supplementsAPI } from '../../services/api';

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

const FREQ_OPTIONS = ['每日1次', '每日2次', '每日3次', '隔日1次', '每周3次', '按需服用'];
const METHOD_OPTIONS = ['随餐', '空腹', '冲服', '睡前', '饭后', '其他'];

const EMPTY_FORM = {
  name: '', brand: '', dosage: '', method: '随餐',
  frequency: '每日1次', startDate: '', note: '',
};

function SupCard({ item, onStop, onDelete, onCheckin, stopped }) {
  const itemId = item._id || item.id;
  const today = new Date().toISOString().split('T')[0];
  const takenToday = item.lastCheckinDate === today;
  return (
    <View style={[styles.card, stopped && styles.cardStopped]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: stopped ? '#F5F5F5' : '#E8F5EF' }]}>
          <Ionicons name="leaf" size={20} color={stopped ? colors.textMuted : '#22A06B'} />
        </View>
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.cardName, stopped && { color: colors.textMuted }]}>{item.name}</Text>
            {item.brand ? <Text style={styles.brandBadge}>{item.brand}</Text> : null}
            {stopped && <Text style={styles.stoppedBadge}>已停用</Text>}
            {!stopped && takenToday && <Text style={[styles.brandBadge, { backgroundColor: '#D1FAE5', color: '#059669' }]}>今日已服</Text>}
          </View>
          <Text style={styles.cardDose}>
            {item.dosage} · {item.method || '随餐'} · {item.frequency}
          </Text>
          {item.startDate ? <Text style={styles.cardDate}>开始：{item.startDate}</Text> : null}
          {stopped && item.stopDate ? <Text style={styles.stopDateText}>停用：{item.stopDate}</Text> : null}
          {item.note ? <Text style={styles.cardNote}>{item.note}</Text> : null}
        </View>
        <TouchableOpacity onPress={() => onDelete(itemId, item.name)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      {!stopped && (
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.checkinBtn, takenToday && styles.checkinBtnDone]}
            onPress={() => !takenToday && onCheckin(itemId, item.name)}
            activeOpacity={takenToday ? 1 : 0.75}
          >
            <Ionicons name={takenToday ? 'checkmark-circle' : 'checkmark-circle-outline'} size={14} color={takenToday ? '#059669' : '#22A06B'} />
            <Text style={[styles.checkinBtnText, takenToday && { color: '#059669' }]}>
              {takenToday ? '今日已服 ✓' : '今日已服'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stopBtn} onPress={() => onStop(itemId, item.name)}>
            <Ionicons name="stop-circle-outline" size={14} color={colors.warning} />
            <Text style={styles.stopBtnText}>标记停用</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function NutritionScreen({ navigation }) {
  const [tab, setTab]           = useState('active');
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [toast, setToast]       = useState(null);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), type === 'success' ? 1800 : 3000);
  };

  const loadItems = useCallback(async () => {
    try {
      const res = await supplementsAPI.list();
      if (res.success && res.data) setItems(res.data);
      else setItems([]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const activeItems  = items.filter(i => !i.stopped);
  const stoppedItems = items.filter(i => i.stopped);
  const displayed    = tab === 'active' ? activeItems : stoppedItems;

  const handleCheckin = async (id, name) => {
    const today = new Date().toISOString().split('T')[0];
    setItems(prev => prev.map(i =>
      (i._id || i.id) === id ? { ...i, lastCheckinDate: today } : i
    ));
    showToast('success', `「${name}」已记录今日服用`);
    try { await supplementsAPI.checkin(id); } catch {}
  };

  const handleStop = async (id, name) => {
    const today = new Date().toISOString().split('T')[0];
    setItems(prev => prev.map(i =>
      (i._id || i.id) === id ? { ...i, stopped: true, stopDate: today } : i
    ));
    showToast('warn', `「${name}」已标记停用`);
    try { await supplementsAPI.stop(id, { stopDate: today }); } catch {}
  };

  const handleDelete = async (id, name) => {
    setItems(prev => prev.filter(i => (i._id || i.id) !== id));
    showToast('warn', `已删除「${name}」`);
    try { await supplementsAPI.delete(id); } catch {}
  };

  const handleAdd = async () => {
    if (!form.name || !form.dosage || !form.frequency) {
      showToast('warn', '请填写营养素名称、剂量和使用频次');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name, brand: form.brand, dosage: form.dosage,
        method: form.method, frequency: form.frequency,
        startDate: form.startDate || new Date().toISOString().slice(0, 10),
        note: form.note,
      };
      const res = await supplementsAPI.create(payload);
      if (res.success && res.data) setItems(prev => [res.data, ...prev]);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      showToast('success', '营养素记录已添加');
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
            <Text style={styles.pageTitle}>营养素管理</Text>
            <Text style={styles.pageSubtitle}>全生命周期营养补充记录</Text>
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

      {/* Stats */}
      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{activeItems.length}</Text>
          <Text style={styles.statLabel}>进行中</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{stoppedItems.length}</Text>
          <Text style={styles.statLabel}>已停用</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{items.length}</Text>
          <Text style={styles.statLabel}>总记录</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {[
          { key: 'active',  label: `进行中 (${activeItems.length})` },
          { key: 'stopped', label: `已停用 (${stoppedItems.length})` },
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
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadItems(); }} tintColor="#22A06B" />
        }
      >
        {loading ? (
          <ActivityIndicator color="#22A06B" style={{ marginTop: 40 }} />
        ) : displayed.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="leaf-outline" size={48} color={colors.border} />
            <Text style={styles.emptyText}>{tab === 'active' ? '暂无进行中的营养素方案' : '暂无已停用的营养素记录'}</Text>
            {tab === 'active' && <Text style={styles.emptySubtext}>营养素方案将由医护团队为您配置并推送{'\n'}您也可点击右上角 + 自行记录</Text>}
          </View>
        ) : (
          displayed.map(item => (
            <SupCard
              key={item._id || item.id}
              item={item}
              stopped={tab === 'stopped'}
              onCheckin={handleCheckin}
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
              <Text style={styles.modalTitle}>添加营养素记录</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                { label: '营养素名称 *', key: 'name', placeholder: '如：维生素C、钙、蛋白粉' },
                { label: '品牌（可选）', key: 'brand', placeholder: '如：Swisse、汤臣倍健' },
                { label: '剂量 *', key: 'dosage', placeholder: '如：500mg、1粒' },
                { label: '备注', key: 'note', placeholder: '如：补充维骨力' },
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
                <Text style={styles.formLabel}>开始补充日期</Text>
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

              <TouchableOpacity
                style={[styles.submitBtn, saving && { opacity: 0.6 }]}
                onPress={handleAdd}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.submitBtnText}>添加营养素记录</Text>
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
    backgroundColor: '#22A06B', overflow: 'hidden', position: 'relative',
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
  statsCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    backgroundColor: colors.white, marginHorizontal: spacing.lg, marginTop: -spacing.sm,
    borderRadius: radius.lg, padding: spacing.md, ...shadow.md,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#22A06B' },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: colors.borderLight },
  tabRow: {
    flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#22A06B' },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.white },
  list: { flex: 1, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary, marginTop: spacing.md },
  emptySubtext: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  card: {
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm,
    borderLeftWidth: 3, borderLeftColor: '#22A06B',
  },
  cardStopped: { borderLeftColor: colors.textMuted, opacity: 0.75 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 3 },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  brandBadge: {
    fontSize: 10, color: '#22A06B', backgroundColor: '#E8F5EF',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontWeight: '600',
  },
  stoppedBadge: {
    fontSize: 10, color: colors.textMuted, backgroundColor: '#F5F5F5',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontWeight: '600',
  },
  cardDose: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  cardDate: { fontSize: 11, color: colors.textMuted },
  stopDateText: { fontSize: 11, color: colors.warning },
  cardNote: { fontSize: 11, color: '#22A06B', marginTop: 2 },
  cardActions: {
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    flexDirection: 'row', gap: spacing.sm,
  },
  checkinBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: '#22A06B',
    backgroundColor: '#E8F5EF',
  },
  checkinBtnDone: { borderColor: '#059669', backgroundColor: '#D1FAE5' },
  checkinBtnText: { fontSize: 12, color: '#22A06B', fontWeight: '600' },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.warning,
  },
  stopBtnText: { fontSize: 12, color: colors.warning, fontWeight: '600' },
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
  tagActive: { borderColor: '#22A06B', backgroundColor: '#E8F5EF' },
  tagText: { fontSize: 12, color: colors.textSecondary },
  tagTextActive: { color: '#22A06B', fontWeight: '600' },
  submitBtn: {
    backgroundColor: '#22A06B', borderRadius: radius.md,
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
