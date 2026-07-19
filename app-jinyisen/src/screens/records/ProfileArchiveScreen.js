import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Modal, TextInput,
  RefreshControl, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme';
import { userAPI, checkupAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// ── 个人档案字段（从 RecordsScreen.js 抽离，2026-07-18 健康档案页瘦身）───
const PROFILE_FIELDS = [
  { key: 'bloodTypeABO',  label: 'ABO 血型',  icon: 'water',              placeholder: '如：A / B / O / AB' },
  { key: 'bloodTypeRH',   label: 'RH 血型',   icon: 'water-outline',      placeholder: '如：阳性 / 阴性' },
  { key: 'drugAllergy',   label: '药物过敏史', icon: 'medical',            placeholder: '如：青霉素类、无' },
  { key: 'foodAllergy',   label: '食物过敏史', icon: 'restaurant-outline',  placeholder: '如：海鲜、无' },
  { key: 'pastHistory',   label: '既往史',    icon: 'time-outline',        placeholder: '如：高血压 (2020年)' },
  { key: 'medicHistory',  label: '用药史',    icon: 'medkit-outline',      placeholder: '如：氨氯地平' },
  { key: 'familyHistory', label: '家族史',    icon: 'people-outline',      placeholder: '如：父亲：高血压' },
  { key: 'surgeryHistory',     label: '手术史',    icon: 'cut-outline',        placeholder: '如：无' },
  { key: 'infectiousHistory',  label: '传染病史',  icon: 'alert-circle-outline', placeholder: '如：乙肝（已治愈）、无', readonly: true },
  { key: 'maritalHistory',     label: '婚育史',    icon: 'people-outline',       placeholder: '如：已婚，育有1子；未婚' },
];

const DEFAULT_PROFILE = {
  bloodType:     'A 型 Rh+',
  drugAllergy:   '青霉素类',
  foodAllergy:   '无',
  pastHistory:   '高血压 (2020年)',
  medicHistory:  '氨氯地平、他汀类',
  familyHistory: '父亲：高血压、冠心病',
  surgeryHistory:     '无',
  infectiousHistory:  '无',
  maritalHistory:     '已婚，育有1子',
};

const PROFILE_KEY = 'jy_health_profile';
const EMPTY_PROFILE = {
  bloodTypeABO: '', bloodTypeRH: '', bloodType: '', drugAllergy: '', foodAllergy: '',
  pastHistory: '', medicHistory: '', familyHistory: '', surgeryHistory: '', infectiousHistory: '', maritalHistory: '',
  menstrualHistory: '', reproductiveHistory: '',
};
function loadProfileFromStorage() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || null; }
  catch { return null; }
}
function saveProfileToStorage(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}

export default function ProfileArchiveScreen({ navigation }) {
  const { user: authUser, isDemo } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [profile, setProfile]         = useState(EMPTY_PROFILE);
  const [checkupPlan, setCheckupPlan] = useState(null);
  const [medInsurance, setMedInsurance] = useState({ basic_insurance: '', commercial_medical: '', critical_illness: '' });

  const [lifestyle, setLifestyle]         = useState({});
  const [lifestyleData, setLifestyleData] = useState({});
  const [editingLifestyle, setEditingLifestyle] = useState(false);
  const [lifestyleDraft, setLifestyleDraft] = useState({});

  // ── 加载档案：先读 localStorage，再从服务器合并 ─────────────────
  useEffect(() => {
    const local = loadProfileFromStorage();
    const fallback = isDemo ? DEFAULT_PROFILE : EMPTY_PROFILE;
    setProfile(local || fallback);
  }, [isDemo]);

  const loadArchive = useCallback(async () => {
    const [meRes, checkupRes] = await Promise.allSettled([
      userAPI.getMe(),
      checkupAPI.get(),
    ]);

    if (meRes.status === 'fulfilled') {
      const data = meRes.value?.data;
      if (data?.lifestyle) setLifestyle(data.lifestyle);
      if (data?.lifestyle_data) setLifestyleData(data.lifestyle_data);
      if (data?.healthProfile && Object.values(data.healthProfile).some(v => v)) {
        const local = loadProfileFromStorage();
        const fallback = isDemo ? DEFAULT_PROFILE : EMPTY_PROFILE;
        const merged = { ...(local || fallback), ...data.healthProfile };
        const fhEmpty = !merged.familyHistory || (Array.isArray(merged.familyHistory) && merged.familyHistory.length === 0);
        if (fhEmpty && data.healthProfile.familyHistoryNote) {
          merged.familyHistory = data.healthProfile.familyHistoryNote;
        }
        if (data.bloodTypeABO) merged.bloodTypeABO = data.bloodTypeABO;
        if (data.bloodTypeRH)  merged.bloodTypeRH  = data.bloodTypeRH;
        // infectiousHistory 是顶层字段，staff 端写入，需从 user 根级读取
        if (data.infectiousHistory) merged.infectiousHistory = data.infectiousHistory;
        setProfile(merged);
        saveProfileToStorage(merged);
      }
      if (data) {
        setMedInsurance({
          basic_insurance:    data.basic_insurance    || '',
          commercial_medical: data.commercial_medical || '',
          critical_illness:   data.critical_illness   || '',
        });
      }
    }
    if (checkupRes.status === 'fulfilled' && checkupRes.value?.data) {
      setCheckupPlan(checkupRes.value.data);
    }
  }, [isDemo]);

  const loadAll = useCallback(async () => {
    await loadArchive();
    setLoading(false);
    setRefreshing(false);
  }, [loadArchive]);

  useEffect(() => { loadAll(); }, []);

  // 从EditProfile返回时刷新档案数据
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      loadArchive();
    });
    return unsub;
  }, [navigation, loadArchive]);

  const saveLifestyle = async () => {
    setLifestyle(lifestyleDraft);
    setEditingLifestyle(false);
    try {
      await userAPI.updateMe({ lifestyle: lifestyleDraft });
    } catch {}
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.pageTitle}>个人资料</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>加载中…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>个人资料</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} tintColor={colors.primary} />
        }
      >
        {/* ── 基本信息 ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="person-outline" size={17} color={colors.primary} />
              <Text style={styles.sectionTitle}>基本信息</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('EditProfile')}>
              <Ionicons name="pencil-outline" size={13} color={colors.primary} />
              <Text style={styles.editBtnText}>编辑</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.profileCard}>
            {[
              { label: '姓名',   value: authUser?.name,                               icon: 'person-outline' },
              { label: '性别',   value: authUser?.gender,                             icon: 'male-female-outline' },
              { label: '年龄',   value: authUser?.age ? `${authUser.age} 岁` : null,  icon: 'calendar-outline' },
              { label: '身高',   value: authUser?.height ? `${authUser.height} cm` : null, icon: 'resize-outline' },
              { label: '体重',   value: authUser?.weight ? `${authUser.weight} kg` : null, icon: 'barbell-outline' },
              ...(authUser?.gender === '女' ? [
                { label: '月经史', value: profile.menstrualHistory, icon: 'medical-outline' },
              ] : []),
            ].map((item, i, arr) => (
              <View key={item.label} style={[styles.profileRow, i < arr.length - 1 && styles.profileRowBorder]}>
                <View style={styles.profileRowLeft}>
                  <Ionicons name={item.icon} size={13} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.profileRowLabel}>{item.label}</Text>
                </View>
                <Text style={[styles.profileRowValue, !item.value && { color: colors.textMuted }]} numberOfLines={1}>
                  {item.value || '未填写'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 基础健康档案 ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="person-circle-outline" size={17} color={colors.primary} />
              <Text style={styles.sectionTitle}>基础健康档案</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('EditProfile')}>
              <Ionicons name="pencil-outline" size={13} color={colors.primary} />
              <Text style={styles.editBtnText}>编辑</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.profileCard}>
            {PROFILE_FIELDS.map((field, i) => (
              <View key={field.key} style={[styles.profileRow, i < PROFILE_FIELDS.length - 1 && styles.profileRowBorder]}>
                <View style={styles.profileRowLeft}>
                  <Ionicons name={field.icon} size={13} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.profileRowLabel}>{field.label}</Text>
                </View>
                <Text style={styles.profileRowValue} numberOfLines={1}>{profile[field.key] || '未填写'}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 医疗保障信息（只读）────────────────────────────────── */}
        {(medInsurance.basic_insurance || medInsurance.commercial_medical || medInsurance.critical_illness) ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="shield-checkmark-outline" size={17} color="#0077B6" />
                <Text style={styles.sectionTitle}>医疗保障信息</Text>
              </View>
            </View>
            <View style={styles.profileCard}>
              {[
                { label: '基础医疗保障', value: medInsurance.basic_insurance },
                { label: '商业医疗险', value: medInsurance.commercial_medical },
                { label: '重疾险', value: medInsurance.critical_illness },
              ].filter(r => r.value).map((row, i, arr) => (
                <View key={row.label} style={[styles.profileRow, i < arr.length - 1 && styles.profileRowBorder]}>
                  <View style={styles.profileRowLeft}>
                    <Ionicons name="checkmark-circle-outline" size={13} color="#0077B6" style={{ marginRight: 6 }} />
                    <Text style={styles.profileRowLabel}>{row.label}</Text>
                  </View>
                  <Text style={styles.profileRowValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── 生活方式 ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="sunny-outline" size={17} color="#D97706" />
              <Text style={styles.sectionTitle}>生活方式</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => { setLifestyleDraft(lifestyle); setEditingLifestyle(true); }}>
              <Ionicons name="pencil-outline" size={13} color={colors.primary} />
              <Text style={styles.editBtnText}>编辑</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.profileCard}>
            {(() => {
              const d = lifestyleData || {};
              const dietParts = [];
              const mealMap = { 居家: '居家', 外卖: '外卖', '饭店或外卖': '外食', 少吃: '少吃', 不吃: '不吃' };
              if (d.breakfastDetail) dietParts.push(`早${mealMap[d.breakfastDetail] || d.breakfastDetail}`);
              if (d.lunchDetail) dietParts.push(`午${mealMap[d.lunchDetail] || d.lunchDetail}`);
              if (d.dinnerDetail) dietParts.push(`晚${mealMap[d.dinnerDetail] || d.dinnerDetail}`);
              const dietVal = dietParts.length ? dietParts.join('、') : lifestyle.diet;

              const exParts = [];
              if (d.exerciseType) exParts.push(d.exerciseType);
              if (d.exerciseFrequency && d.exerciseFrequency !== '无') exParts.push(d.exerciseFrequency);
              if (d.exerciseDuration) exParts.push(`${d.exerciseDuration}分钟/次`);
              const exVal = exParts.length ? exParts.join('，') : lifestyle.exercise;

              const sleepParts = [];
              if (d.sleepTime) sleepParts.push(`入睡${d.sleepTime}`);
              if (d.wakeTime) sleepParts.push(`起床${d.wakeTime}`);
              if (d.scheduleRegularity) sleepParts.push(d.scheduleRegularity);
              const sleepVal = sleepParts.length ? sleepParts.join('，') : lifestyle.sleep;

              const waterVal = d.dailyWater || lifestyle.water;

              const smokeParts = [];
              if (d.smokingStatus) smokeParts.push(`吸烟：${d.smokingStatus}`);
              if (d.drinkingFrequency) smokeParts.push(`饮酒：${d.drinkingFrequency}`);
              const smokeVal = smokeParts.length ? smokeParts.join('；') : (lifestyle.alcohol || lifestyle.smoking);

              const allergenList = (d.foodAllergens || []).filter(a => a !== '无');
              const allergyVal = allergenList.length ? allergenList.join('、') : '无';

              const items = [
                { label: '饮食',   icon: 'nutrition-outline', color: '#059669', val: dietVal },
                { label: '运动',   icon: 'fitness-outline',   color: '#0077B6', val: exVal },
                { label: '睡眠',   icon: 'moon-outline',      color: '#4F46E5', val: sleepVal },
                { label: '饮水',   icon: 'water-outline',     color: '#0EA5E9', val: waterVal },
                { label: '排便',   icon: 'list-outline',      color: '#7C5C3D', val: lifestyle.bowel },
                { label: '烟酒',   icon: 'wine-outline',      color: '#9D174D', val: smokeVal },
                { label: '过敏史', icon: 'alert-circle-outline', color: '#B45309', val: allergyVal },
              ];
              return items.map((item, i) => (
                <View key={item.label} style={[styles.profileRow, i < items.length - 1 && styles.profileRowBorder]}>
                  <View style={styles.profileRowLeft}>
                    <Ionicons name={item.icon} size={13} color={item.color} style={{ marginRight: 6 }} />
                    <Text style={styles.profileRowLabel}>{item.label}</Text>
                  </View>
                  <Text style={[styles.profileRowValue, !item.val && { color: colors.textMuted }]} numberOfLines={1}>
                    {item.val || '未填写'}
                  </Text>
                </View>
              ));
            })()}
          </View>
        </View>

        {/* ── 年度复查计划 ─────────────────────────────────────── */}
        {checkupPlan && checkupPlan.items?.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="calendar-outline" size={17} color={colors.info} />
                <Text style={styles.sectionTitle}>{checkupPlan.title || '年度复查计划'}</Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>
                {checkupPlan.items.filter(it => it.status === 'done').length}/{checkupPlan.items.length} 已完成
              </Text>
            </View>
            {checkupPlan.note ? (
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, marginHorizontal: spacing.sm }}>
                {checkupPlan.note}
              </Text>
            ) : null}
            <View style={styles.profileCard}>
              {checkupPlan.items.map((item, i, arr) => {
                const isDone    = item.status === 'done';
                const isOverdue = item.status === 'overdue';
                return (
                  <View key={item._id || i} style={[styles.profileRow, i < arr.length - 1 && styles.profileRowBorder]}>
                    <View style={styles.profileRowLeft}>
                      <Ionicons
                        name={isDone ? 'checkmark-circle' : isOverdue ? 'alert-circle-outline' : 'ellipse-outline'}
                        size={15}
                        color={isDone ? colors.success : isOverdue ? colors.danger : colors.textMuted}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[styles.profileRowLabel, isDone && { textDecorationLine: 'line-through', color: colors.textMuted }]}>
                        {item.name}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: isDone ? colors.success : isOverdue ? colors.danger : colors.textMuted }}>
                      {isDone ? '已完成' : isOverdue ? '已逾期' : (item.targetDate || '待安排')}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      {/* ── 编辑生活方式 Modal ───────────────────────────────────── */}
      <Modal visible={editingLifestyle} animationType="slide" transparent onRequestClose={() => setEditingLifestyle(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.editOverlay}>
            <View style={styles.editCard}>
              <View style={styles.editHandle} />
              <View style={styles.editHeader}>
                <Text style={styles.editTitle}>编辑生活方式</Text>
                <TouchableOpacity onPress={() => setEditingLifestyle(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {[
                  { key: 'diet',     label: '饮食',  icon: 'nutrition-outline',  placeholder: '如：三餐规律，以主食蔬菜为主，少油少盐' },
                  { key: 'exercise', label: '运动',  icon: 'fitness-outline',    placeholder: '如：跑步，每周3次，每次30分钟' },
                  { key: 'sleep',    label: '睡眠',  icon: 'moon-outline',       placeholder: '如：7小时，质量良好，早晨清醒' },
                  { key: 'water',    label: '饮水',  icon: 'water-outline',      placeholder: '如：白水为主，每日约2000毫升' },
                  { key: 'alcohol',  label: '饮酒',  icon: 'wine-outline',       placeholder: '如：红酒，每次100ml，每周1次，未曾醉酒' },
                  { key: 'smoking',  label: '吸烟',  icon: 'flame-outline',      placeholder: '如：不吸烟 / 卷烟，每日10支，2010年起' },
                  { key: 'bowel',    label: '排便',  icon: 'list-outline',       placeholder: '如：1次/日，成形，无特殊' },
                ].map(field => (
                  <View key={field.key} style={styles.editField}>
                    <View style={styles.editFieldLabel}>
                      <Ionicons name={field.icon} size={14} color={colors.primary} style={{ marginRight: 6 }} />
                      <Text style={styles.editFieldLabelText}>{field.label}</Text>
                    </View>
                    <TextInput
                      style={styles.editInput}
                      value={lifestyleDraft[field.key] || ''}
                      onChangeText={v => setLifestyleDraft(p => ({ ...p, [field.key]: v }))}
                      placeholder={field.placeholder}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                ))}
                {/* 情绪（初始记录）—— 来自健康初评，只读展示 */}
                <View style={styles.editField}>
                  <View style={styles.editFieldLabel}>
                    <Ionicons name="happy-outline" size={14} color="#F59E0B" style={{ marginRight: 6 }} />
                    <Text style={styles.editFieldLabelText}>情绪</Text>
                    <Text style={styles.editFieldInitialTag}>初始记录</Text>
                  </View>
                  <View style={[styles.editInput, styles.editInputReadonly]}>
                    <Text style={{ color: lifestyleDraft.mood ? colors.textPrimary : colors.textMuted, fontSize: 14 }}>
                      {lifestyleDraft.mood || '来自健康初评，如需修改请联系健康管理师'}
                    </Text>
                  </View>
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
              <TouchableOpacity style={styles.saveBtn} onPress={saveLifestyle} activeOpacity={0.85}>
                <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                <Text style={styles.saveBtnText}>保存生活方式</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { color: colors.textMuted, fontSize: 14 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: 4 },
  pageTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },

  section: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },

  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.full, backgroundColor: colors.primary10 },
  editBtnText: { fontSize: 12, color: colors.primary, fontWeight: '600' },

  profileCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  profileRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  profileRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  profileRowLeft: { flexDirection: 'row', alignItems: 'center' },
  profileRowLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  profileRowValue: { fontSize: 13, color: colors.textPrimary, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },

  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  editCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl,
    maxHeight: '88%',
  },
  editHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 16,
  },
  editHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  editTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  editField: { marginBottom: spacing.md },
  editFieldLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  editFieldLabelText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  editFieldInitialTag: { fontSize: 10, color: '#F59E0B', fontWeight: '600', backgroundColor: '#FEF3E2', borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 6 },
  editInput: {
    backgroundColor: colors.background, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.sm, paddingVertical: 10,
    fontSize: 14, color: colors.textPrimary,
  },
  editInputReadonly: { borderStyle: 'dashed', borderColor: colors.border, opacity: 0.75 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, marginTop: spacing.sm,
  },
  saveBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
