import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Switch, RefreshControl,
  Modal, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { remindersAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// ── 11个类别定义 ──────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'followup_abnormal', label: '异常复查',   icon: 'medical-outline',      color: '#EF4444', scheduleType: 'once'      },
  { key: 'medication',        label: '用药提醒',   icon: 'medkit-outline',        color: '#1E6B50', scheduleType: 'recurring' },
  { key: 'supplement',        label: '营养素补充', icon: 'nutrition-outline',     color: '#10B981', scheduleType: 'recurring' },
  { key: 'monitoring',        label: '日常监测',   icon: 'pulse-outline',         color: '#3B82F6', scheduleType: 'recurring' },
  { key: 'screening_annual',  label: '年度筛查',   icon: 'search-circle-outline', color: '#8B5CF6', scheduleType: 'once'      },
  { key: 'vaccination',       label: '疫苗接种',   icon: 'shield-checkmark-outline', color: '#F59E0B', scheduleType: 'once'  },
  { key: 'diet_checkin',      label: '饮食打卡',   icon: 'restaurant-outline',    color: '#F97316', scheduleType: 'recurring' },
  { key: 'exercise_checkin',  label: '运动打卡',   icon: 'barbell-outline',       color: '#06B6D4', scheduleType: 'recurring' },
  { key: 'weight_checkin',    label: '体重打卡',   icon: 'scale-outline',         color: '#6366F1', scheduleType: 'recurring' },
  { key: 'sleep',             label: '入睡提醒',   icon: 'moon-outline',          color: '#7C3AED', scheduleType: 'recurring' },
  { key: 'substance',         label: '烟酒提醒',   icon: 'warning-outline',       color: '#DC2626', scheduleType: 'recurring' },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

const DAY_MAP = { Mon:'一', Tue:'二', Wed:'三', Thu:'四', Fri:'五', Sat:'六', Sun:'日' };
const ALL_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINS  = ['00', '15', '30', '45'];

// ── 调度摘要文本 ──────────────────────────────────────────────────
function scheduleText(r) {
  if (r.scheduleType === 'once') {
    if (!r.targetDate) return '待设定日期';
    const d = new Date(r.targetDate);
    return `${d.getMonth()+1}月${d.getDate()}日`;
  }
  const time = r.reminderTime || '08:00';
  let freq = '';
  if (r.customEveryNDays) {
    freq = `每${r.customEveryNDays}天`;
  } else if (!r.daysOfWeek || r.daysOfWeek.length === 0 || r.daysOfWeek.length === 7) {
    freq = '每天';
  } else {
    freq = '每周' + r.daysOfWeek.map(d => DAY_MAP[d]).join('');
  }
  const end = r.endDate ? `，至${new Date(r.endDate).getMonth()+1}/${new Date(r.endDate).getDate()}` : '';
  return `${freq} ${time}${end}`;
}

// ── 提醒卡片 ─────────────────────────────────────────────────────
function ReminderCard({ item, onToggle, onDelete }) {
  const cat = CAT_MAP[item.category] || CATEGORIES[0];
  const isToday = item.isActiveToday;
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onLongPress={() => onDelete(item._id || item.id, item.title)}
    >
      <View style={[styles.card, isToday && { borderLeftWidth: 3, borderLeftColor: cat.color }]}>
        <View style={[styles.cardIcon, { backgroundColor: cat.color + '15' }]}>
          <Ionicons name={cat.icon} size={20} color={cat.color} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <View style={styles.cardMeta}>
                <View style={[styles.catBadge, { backgroundColor: cat.color + '15' }]}>
                  <Text style={[styles.catBadgeText, { color: cat.color }]}>{cat.label}</Text>
                </View>
                <Text style={styles.scheduleText}>{scheduleText(item)}</Text>
              </View>
              {!!item.description && (
                <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
              )}
            </View>
            <Switch
              value={item.enabled}
              onValueChange={() => onToggle(item._id || item.id)}
              trackColor={{ false: colors.border, true: cat.color + '60' }}
              thumbColor={item.enabled ? cat.color : '#f4f3f4'}
              style={{ marginLeft: spacing.sm }}
            />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── 创建提醒弹窗 ──────────────────────────────────────────────────
function CreateModal({ visible, onClose, onCreate }) {
  const [step, setStep] = useState(0); // 0=选类别 1=填信息
  const [selCat, setSelCat] = useState(null);
  const [form, setForm] = useState({
    title: '', description: '',
    // once
    targetDate: '',
    daysFromNow: '',
    // recurring
    hour: '08', minute: '00',
    freqType: 'daily', // 'daily'|'weekdays'|'custom_days'|'every_n'
    selectedDays: [...ALL_DAYS],
    everyNDays: '2',
    hasEndDate: false,
    endDate: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const reset = () => { setStep(0); setSelCat(null); setForm({ title:'', description:'', targetDate:'', daysFromNow:'', hour:'08', minute:'00', freqType:'daily', selectedDays:[...ALL_DAYS], everyNDays:'2', hasEndDate:false, endDate:'' }); setSaving(false); };
  const handleClose = () => { reset(); onClose(); };

  const toggleDay = (d) => set('selectedDays', form.selectedDays.includes(d) ? form.selectedDays.filter(x => x !== d) : [...form.selectedDays, d]);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const cat = CAT_MAP[selCat];
      const payload = {
        category: selCat,
        title: form.title.trim(),
        description: form.description.trim(),
        scheduleType: cat.scheduleType,
        enabled: true,
      };

      if (cat.scheduleType === 'once') {
        if (form.daysFromNow) {
          const d = new Date();
          d.setDate(d.getDate() + parseInt(form.daysFromNow));
          payload.targetDate = d.toISOString();
        } else if (form.targetDate) {
          payload.targetDate = new Date(form.targetDate).toISOString();
        }
      } else {
        payload.reminderTime = `${form.hour}:${form.minute}`;
        if (form.freqType === 'daily')        { payload.daysOfWeek = []; }
        else if (form.freqType === 'weekdays') { payload.daysOfWeek = ['Mon','Tue','Wed','Thu','Fri']; }
        else if (form.freqType === 'custom_days') { payload.daysOfWeek = form.selectedDays; }
        else if (form.freqType === 'every_n') {
          payload.customEveryNDays = parseInt(form.everyNDays) || 2;
          payload.startDate = new Date().toISOString();
          payload.daysOfWeek = [];
        }
        if (form.hasEndDate && form.endDate) payload.endDate = new Date(form.endDate).toISOString();
      }

      await onCreate(payload);
      handleClose();
    } catch {}
    finally { setSaving(false); }
  };

  const cat = selCat ? CAT_MAP[selCat] : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={step === 1 ? () => setStep(0) : handleClose} style={styles.modalBack}>
              <Ionicons name={step === 1 ? 'arrow-back' : 'close'} size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{step === 0 ? '选择提醒类型' : `新建${cat?.label}`}</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {step === 0 ? (
              // 类别选择网格
              <View style={styles.catGrid}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.catCard, selCat === c.key && { borderColor: c.color, borderWidth: 2 }]}
                    onPress={() => { setSelCat(c.key); setStep(1); }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.catCardIcon, { backgroundColor: c.color + '15' }]}>
                      <Ionicons name={c.icon} size={24} color={c.color} />
                    </View>
                    <Text style={styles.catCardLabel}>{c.label}</Text>
                    <Text style={styles.catCardType}>{c.scheduleType === 'once' ? '单次提醒' : '重复提醒'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              // 表单填写
              <View style={styles.formWrap}>
                {/* 标题 */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>提醒标题 *</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={`如：${cat?.label}`}
                    value={form.title}
                    onChangeText={v => set('title', v)}
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                {/* 备注 */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>备注说明</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="详细说明（可选）"
                    value={form.description}
                    onChangeText={v => set('description', v)}
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                {cat?.scheduleType === 'once' ? (
                  // 单次：日期选择
                  <>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>提醒方式</Text>
                      <View style={styles.segRow}>
                        {[['daysFromNow_mode', 'N天后提醒'], ['date_mode', '指定日期']].map(([k, lbl]) => (
                          <TouchableOpacity
                            key={k}
                            style={[styles.seg, form.daysFromNow && k === 'daysFromNow_mode' && styles.segActive, !form.daysFromNow && k === 'date_mode' && styles.segActive]}
                            onPress={() => { if (k === 'daysFromNow_mode') set('targetDate', ''); else set('daysFromNow', ''); }}
                          >
                            <Text style={styles.segText}>{lbl}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    {form.daysFromNow !== '' || !form.targetDate ? (
                      <View style={styles.formGroup}>
                        <Text style={styles.formLabel}>距今天数</Text>
                        <View style={styles.fieldRow}>
                          <TextInput
                            style={[styles.formInput, { flex: 1 }]}
                            placeholder="如：30"
                            value={form.daysFromNow}
                            onChangeText={v => { set('daysFromNow', v); set('targetDate', ''); }}
                            keyboardType="number-pad"
                            placeholderTextColor={colors.textMuted}
                          />
                          <Text style={styles.unitText}>天后</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.formGroup}>
                        <Text style={styles.formLabel}>指定日期</Text>
                        <TextInput
                          style={styles.formInput}
                          placeholder="YYYY-MM-DD"
                          value={form.targetDate}
                          onChangeText={v => { set('targetDate', v); set('daysFromNow', ''); }}
                          placeholderTextColor={colors.textMuted}
                        />
                      </View>
                    )}
                  </>
                ) : (
                  // 重复：时间 + 频率
                  <>
                    {/* 提醒时间 */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>提醒时间</Text>
                      <View style={styles.timeRow}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          {HOURS.map(h => (
                            <TouchableOpacity
                              key={h}
                              style={[styles.timeChip, form.hour === h && styles.timeChipActive]}
                              onPress={() => set('hour', h)}
                            >
                              <Text style={[styles.timeChipText, form.hour === h && styles.timeChipTextActive]}>{h}时</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                      <View style={[styles.timeRow, { marginTop: 6 }]}>
                        {MINS.map(m => (
                          <TouchableOpacity
                            key={m}
                            style={[styles.timeChip, form.minute === m && styles.timeChipActive]}
                            onPress={() => set('minute', m)}
                          >
                            <Text style={[styles.timeChipText, form.minute === m && styles.timeChipTextActive]}>{m}分</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* 频率 */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>提醒频率</Text>
                      <View style={styles.freqGrid}>
                        {[
                          ['daily',       '每天'],
                          ['weekdays',    '工作日'],
                          ['custom_days', '自选星期'],
                          ['every_n',     '每N天'],
                        ].map(([k, lbl]) => (
                          <TouchableOpacity
                            key={k}
                            style={[styles.freqChip, form.freqType === k && styles.freqChipActive]}
                            onPress={() => set('freqType', k)}
                          >
                            <Text style={[styles.freqChipText, form.freqType === k && styles.freqChipTextActive]}>{lbl}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {form.freqType === 'custom_days' && (
                        <View style={styles.daysRow}>
                          {ALL_DAYS.map(d => (
                            <TouchableOpacity
                              key={d}
                              style={[styles.dayBtn, form.selectedDays.includes(d) && styles.dayBtnActive]}
                              onPress={() => toggleDay(d)}
                            >
                              <Text style={[styles.dayBtnText, form.selectedDays.includes(d) && styles.dayBtnTextActive]}>
                                {DAY_MAP[d]}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      {form.freqType === 'every_n' && (
                        <View style={[styles.fieldRow, { marginTop: 8 }]}>
                          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>每</Text>
                          <TextInput
                            style={[styles.formInput, { flex: 1, marginHorizontal: 8 }]}
                            value={form.everyNDays}
                            onChangeText={v => set('everyNDays', v)}
                            keyboardType="number-pad"
                            placeholderTextColor={colors.textMuted}
                          />
                          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>天提醒一次</Text>
                        </View>
                      )}
                    </View>

                    {/* 是否限时 */}
                    <View style={styles.formGroup}>
                      <View style={styles.switchRow}>
                        <Text style={styles.formLabel}>设置结束日期</Text>
                        <Switch
                          value={form.hasEndDate}
                          onValueChange={v => set('hasEndDate', v)}
                          trackColor={{ false: colors.border, true: colors.primary + '60' }}
                          thumbColor={form.hasEndDate ? colors.primary : '#f4f3f4'}
                        />
                      </View>
                      {form.hasEndDate && (
                        <TextInput
                          style={[styles.formInput, { marginTop: 8 }]}
                          placeholder="结束日期 YYYY-MM-DD"
                          value={form.endDate}
                          onChangeText={v => set('endDate', v)}
                          placeholderTextColor={colors.textMuted}
                        />
                      )}
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: cat?.color || colors.primary }, saving && { opacity: 0.6 }]}
                  onPress={handleCreate}
                  disabled={saving || !form.title.trim()}
                >
                  {saving
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={styles.submitBtnText}>创建提醒</Text>
                  }
                </TouchableOpacity>
                <View style={{ height: spacing.xl * 2 }} />
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function RemindersScreen({ navigation }) {
  const { isDemo } = useAuth();
  const [reminders, setReminders] = useState([]);
  const [filterCat, setFilterCat] = useState('全部');
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, isErr = false) => {
    setToast({ msg, isErr });
    setTimeout(() => setToast(null), 2200);
  };

  const load = useCallback(async () => {
    try {
      const res = await remindersAPI.list();
      setReminders(res.success && res.data?.length > 0 ? res.data : []);
    } catch { setReminders([]); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filterCat === '全部'
    ? reminders
    : reminders.filter(r => r.category === filterCat);

  const todayCount   = reminders.filter(r => r.isActiveToday && r.enabled).length;
  const enabledCount = reminders.filter(r => r.enabled).length;

  const handleToggle = async (id) => {
    setReminders(prev => prev.map(r => (r._id || r.id) === id ? { ...r, enabled: !r.enabled } : r));
    try { await remindersAPI.toggle(id); } catch {}
  };

  const handleDelete = (id, title) => {
    setReminders(prev => prev.filter(r => (r._id || r.id) !== id));
    showToast(`已删除「${title}」`);
    remindersAPI.delete(id).catch(() => {});
  };

  const handleCreate = async (payload) => {
    const res = await remindersAPI.create(payload);
    if (res.success && res.data) {
      setReminders(prev => [{ ...res.data, isActiveToday: false }, ...prev]);
      showToast('提醒已创建 ✓');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>提醒管理</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      {toast && (
        <View style={[styles.toast, toast.isErr && styles.toastErr]}>
          <Text style={styles.toastText}>{toast.msg}</Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {/* 统计 */}
        <View style={styles.statsRow}>
          {[
            { val: enabledCount, label: '已启用', color: colors.primary },
            { val: todayCount,   label: '今日活跃', color: colors.warning },
            { val: reminders.length, label: '全部提醒', color: colors.textSecondary },
          ].map((s, i) => (
            <View key={i} style={styles.statCard}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* 分类筛选 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catFilterRow}>
          {['全部', ...CATEGORIES.map(c => c.key)].map(k => {
            const cat = k === '全部' ? null : CAT_MAP[k];
            const isActive = filterCat === k;
            return (
              <TouchableOpacity
                key={k}
                style={[styles.filterChip, isActive && { backgroundColor: (cat?.color || colors.primary) + '15', borderColor: cat?.color || colors.primary }]}
                onPress={() => setFilterCat(k)}
              >
                {cat && <Ionicons name={cat.icon} size={12} color={isActive ? cat.color : colors.textMuted} style={{ marginRight: 3 }} />}
                <Text style={[styles.filterChipText, isActive && { color: cat?.color || colors.primary, fontWeight: '700' }]}>
                  {cat ? cat.label : '全部'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* 提醒列表 */}
        <View style={styles.list}>
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>暂无提醒，点击右上角 + 添加</Text>
            </View>
          ) : (
            filtered.map(r => (
              <ReminderCard key={r._id || r.id} item={r} onToggle={handleToggle} onDelete={handleDelete} />
            ))
          )}
        </View>

        {/* 长按提示 */}
        {filtered.length > 0 && (
          <Text style={styles.hint}>长按提醒卡片可删除</Text>
        )}
        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      <CreateModal visible={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  pageTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  toast: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    backgroundColor: '#22A06B', borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 9,
  },
  toastErr: { backgroundColor: '#DC3545' },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm,
  },
  statCard: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.md,
    paddingVertical: 12, alignItems: 'center', ...shadow.xs,
  },
  statVal: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  catFilterRow: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs,
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  filterChipText: { fontSize: 12, color: colors.textSecondary },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, ...shadow.xs, gap: spacing.sm,
  },
  cardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardBody: { flex: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 4 },
  catBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  catBadgeText: { fontSize: 10, fontWeight: '600' },
  scheduleText: { fontSize: 11, color: colors.textMuted },
  cardDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted },
  hint: { textAlign: 'center', fontSize: 11, color: colors.textMuted, marginTop: spacing.md },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingBottom: spacing.lg, maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  modalBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  catGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    padding: spacing.lg,
  },
  catCard: {
    width: '30%', backgroundColor: colors.background, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: colors.borderLight,
  },
  catCardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  catCardLabel: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  catCardType: { fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  formWrap: { padding: spacing.lg },
  formGroup: { marginBottom: spacing.md },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  formInput: {
    backgroundColor: colors.background, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: 14, color: colors.textPrimary,
    borderWidth: 1.5, borderColor: colors.border,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  unitText: { fontSize: 14, color: colors.textSecondary },
  segRow: { flexDirection: 'row', gap: spacing.sm },
  seg: {
    flex: 1, padding: 9, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  segActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  segText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  timeChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white,
  },
  timeChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  timeChipText: { fontSize: 12, color: colors.textSecondary },
  timeChipTextActive: { color: colors.primary, fontWeight: '600' },
  freqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  freqChip: {
    paddingHorizontal: spacing.md, paddingVertical: 7,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white,
  },
  freqChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  freqChipText: { fontSize: 12, color: colors.textSecondary },
  freqChipTextActive: { color: colors.primary, fontWeight: '700' },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  dayBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  dayBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  dayBtnText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  dayBtnTextActive: { color: colors.white },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  submitBtn: {
    borderRadius: radius.md, padding: spacing.md,
    alignItems: 'center', marginTop: spacing.md,
  },
  submitBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
